import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseRangeHeader, streamAudioWithRange } from "./streamService";

// ── parseRangeHeader ────────────────────────────────────────────────────

describe("parseRangeHeader", () => {
  const FILE_SIZE = 10000;

  it("parses a standard byte range", () => {
    expect(parseRangeHeader("bytes=0-499", FILE_SIZE)).toEqual({ start: 0, end: 499 });
    expect(parseRangeHeader("bytes=500-999", FILE_SIZE)).toEqual({ start: 500, end: 999 });
  });

  it("parses an open-ended range (no end)", () => {
    expect(parseRangeHeader("bytes=5000-", FILE_SIZE)).toEqual({ start: 5000, end: 9999 });
    expect(parseRangeHeader("bytes=0-", FILE_SIZE)).toEqual({ start: 0, end: 9999 });
  });

  it("parses a suffix-byte range", () => {
    expect(parseRangeHeader("bytes=-500", FILE_SIZE)).toEqual({ start: 9500, end: 9999 });
    expect(parseRangeHeader("bytes=-10000", FILE_SIZE)).toEqual({ start: 0, end: 9999 });
  });

  it("clamps suffix range larger than file size to start at 0", () => {
    expect(parseRangeHeader("bytes=-20000", FILE_SIZE)).toEqual({ start: 0, end: 9999 });
  });

  it("clamps end beyond file size", () => {
    expect(parseRangeHeader("bytes=9000-50000", FILE_SIZE)).toEqual({ start: 9000, end: 9999 });
  });

  it("returns null for empty range (both parts missing)", () => {
    expect(parseRangeHeader("bytes=-", FILE_SIZE)).toBeNull();
  });

  it("returns null for start >= fileSize", () => {
    expect(parseRangeHeader("bytes=10000-", FILE_SIZE)).toBeNull();
    expect(parseRangeHeader("bytes=99999-", FILE_SIZE)).toBeNull();
  });

  it("returns null for end < start", () => {
    expect(parseRangeHeader("bytes=500-100", FILE_SIZE)).toBeNull();
  });

  it("returns null for non-integer values", () => {
    expect(parseRangeHeader("bytes=1.5-3.5", FILE_SIZE)).toBeNull();
  });

  it("returns null for malformed headers", () => {
    expect(parseRangeHeader("", FILE_SIZE)).toBeNull();
    expect(parseRangeHeader("bytes", FILE_SIZE)).toBeNull();
    expect(parseRangeHeader("chars=0-100", FILE_SIZE)).toBeNull();
    expect(parseRangeHeader("bytes=abc-def", FILE_SIZE)).toBeNull();
  });

  it("returns null for negative suffix length", () => {
    expect(parseRangeHeader("bytes=-0", FILE_SIZE)).toBeNull();
  });

  it("handles the last byte correctly", () => {
    expect(parseRangeHeader("bytes=9999-9999", FILE_SIZE)).toEqual({ start: 9999, end: 9999 });
  });

  it("is case insensitive for the bytes= prefix", () => {
    expect(parseRangeHeader("Bytes=0-499", FILE_SIZE)).toEqual({ start: 0, end: 499 });
    expect(parseRangeHeader("BYTES=0-499", FILE_SIZE)).toEqual({ start: 0, end: 499 });
  });

  it("handles whitespace around the header", () => {
    expect(parseRangeHeader("  bytes=0-499  ", FILE_SIZE)).toEqual({ start: 0, end: 499 });
  });

  it("returns null for a zero-size file", () => {
    expect(parseRangeHeader("bytes=0-0", 0)).toBeNull();
    expect(parseRangeHeader("bytes=0-", 0)).toBeNull();
  });

  it("handles single-byte file correctly", () => {
    expect(parseRangeHeader("bytes=0-0", 1)).toEqual({ start: 0, end: 0 });
    expect(parseRangeHeader("bytes=-1", 1)).toEqual({ start: 0, end: 0 });
  });
});

// ── streamAudioWithRange ────────────────────────────────────────────────

describe("streamAudioWithRange", () => {
  let tmpDir: string;
  let testFilePath: string;
  const FILE_CONTENT = Buffer.from("Hello, this is a test audio file content for streaming tests!");

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "stream-test-"));
    testFilePath = path.join(tmpDir, "test.flac");
    await fsp.writeFile(testFilePath, FILE_CONTENT);
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  function createMockReq(rangeHeader?: string) {
    return {
      headers: rangeHeader ? { range: rangeHeader } : {}
    } as unknown as import("express").Request;
  }

  function createMockRes() {
    let statusCode = 0;
    const headers = new Map<string, string | number>();
    const chunks: Buffer[] = [];
    let ended = false;

    const res = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      setHeader(name: string, value: string | number) {
        headers.set(name.toLowerCase(), value);
        return res;
      },
      end() {
        ended = true;
      },
      // Writable stream interface for pipe()
      write(chunk: Buffer | string) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return true;
      },
      on(_event: string, _handler: () => void) {
        return res;
      },
      once(_event: string, _handler: () => void) {
        return res;
      },
      emit(_event: string, ..._args: unknown[]) {
        return false;
      },
      removeListener(_event: string, _handler: () => void) {
        return res;
      },

      // Accessors for assertions
      get _statusCode() { return statusCode; },
      get _headers() { return headers; },
      get _body() { return Buffer.concat(chunks); },
      get _ended() { return ended; }
    };

    return res;
  }

  it("serves full file with 200 when no Range header", async () => {
    const req = createMockReq();
    const res = createMockRes();

    await streamAndWait(req, res as unknown as import("express").Response, testFilePath, "audio/flac");

    expect(res._statusCode).toBe(200);
    expect(res._headers.get("content-type")).toBe("audio/flac");
    expect(res._headers.get("content-length")).toBe(FILE_CONTENT.length);
    expect(res._headers.get("accept-ranges")).toBe("bytes");
    expect(res._body.toString()).toBe(FILE_CONTENT.toString());
  });

  it("serves partial content with 206 for valid range", async () => {
    const req = createMockReq("bytes=0-9");
    const res = createMockRes();

    await streamAndWait(req, res as unknown as import("express").Response, testFilePath, "audio/flac");

    expect(res._statusCode).toBe(206);
    expect(res._headers.get("content-length")).toBe(10);
    expect(res._headers.get("content-range")).toBe(`bytes 0-9/${FILE_CONTENT.length}`);
    expect(res._body.toString()).toBe(FILE_CONTENT.subarray(0, 10).toString());
  });

  it("serves suffix range with 206", async () => {
    const req = createMockReq("bytes=-10");
    const res = createMockRes();

    await streamAndWait(req, res as unknown as import("express").Response, testFilePath, "audio/flac");

    expect(res._statusCode).toBe(206);
    const expectedStart = FILE_CONTENT.length - 10;
    expect(res._headers.get("content-range")).toBe(
      `bytes ${expectedStart}-${FILE_CONTENT.length - 1}/${FILE_CONTENT.length}`
    );
    expect(res._body.toString()).toBe(FILE_CONTENT.subarray(expectedStart).toString());
  });

  it("returns 416 for invalid range", async () => {
    const req = createMockReq("bytes=99999-");
    const res = createMockRes();

    await streamAndWait(req, res as unknown as import("express").Response, testFilePath, "audio/flac");

    expect(res._statusCode).toBe(416);
    expect(res._headers.get("content-range")).toBe(`bytes */${FILE_CONTENT.length}`);
  });

  it("returns 416 for malformed range header", async () => {
    const req = createMockReq("invalid-range");
    const res = createMockRes();

    await streamAndWait(req, res as unknown as import("express").Response, testFilePath, "audio/flac");

    expect(res._statusCode).toBe(416);
  });
});

/**
 * Helper that calls streamAudioWithRange and waits for the file stream
 * to finish piping into the mock response.
 */
function streamAndWait(
  req: import("express").Request,
  res: import("express").Response,
  filePath: string,
  mimeType: string
): Promise<void> {
  // Wrap in a promise that resolves once piping finishes
  return new Promise<void>((resolve, reject) => {
    // Intercept pipe() on the response to know when the stream ends
    const originalOn = (res as any).on;
    const pipeFinishHandlers: Array<() => void> = [];

    (res as any).on = function (event: string, handler: () => void) {
      if (event === "finish" || event === "close") {
        pipeFinishHandlers.push(handler);
      }
      return originalOn?.call(this, event, handler) ?? this;
    };

    // streamAudioWithRange calls pipe() which creates a ReadStream.
    // We need to detect when it finishes. Override pipe behavior by
    // patching createReadStream result indirectly via the response.
    const originalEnd = res.end;
    (res as any).end = function (...args: unknown[]) {
      originalEnd?.apply(this, args as any);
      // For 416 responses that call res.end() directly
      resolve();
      return this;
    };

    // For piped responses, we rely on the stream 'end' event
    const originalWrite = res.write;
    let writeTimer: ReturnType<typeof setTimeout> | undefined;

    (res as any).write = function (...args: unknown[]) {
      const result = (originalWrite as any)?.apply(this, args);
      // Reset a short debounce timer — resolve once writes stop
      clearTimeout(writeTimer);
      writeTimer = setTimeout(() => resolve(), 50);
      return result;
    };

    streamAudioWithRange(req, res, filePath, mimeType).catch(reject);
  });
}
