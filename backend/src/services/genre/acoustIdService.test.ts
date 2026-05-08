import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { tmpDir } = vi.hoisted(() => {
  const fsS = require("node:fs") as typeof import("node:fs");
  const osM = require("node:os") as typeof import("node:os");
  const pathM = require("node:path") as typeof import("node:path");
  return {
    tmpDir: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "acoustid-test-"))
  };
});

vi.mock("../../utils/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths")>()),
  cacheRoot: tmpDir
}));

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

const CACHE_FILE = path.join(tmpDir, "acoustid-cache.json");

type FetchHandler = (url: string, init?: RequestInit) => { status?: number; body?: unknown; throw?: Error };

let fetchHandler: FetchHandler = () => ({ status: 200, body: { status: "ok", results: [] } });
let fetchCalls: Array<{ url: string; body: string }> = [];

beforeEach(async () => {
  vi.resetModules();
  for (const entry of await fs.readdir(tmpDir).catch(() => [])) {
    await fs.rm(path.join(tmpDir, entry), { recursive: true, force: true });
  }
  fetchHandler = () => ({ status: 200, body: { status: "ok", results: [] } });
  fetchCalls = [];
  process.env.ACOUSTID_API_KEY = "test-key";
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = typeof init?.body === "string" ? init.body : "";
    fetchCalls.push({ url, body });
    const result = fetchHandler(url, init);
    if (result.throw) throw result.throw;
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status ?? 200,
      headers: { "Content-Type": "application/json" }
    });
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
  delete process.env.ACOUSTID_API_KEY;
  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

async function loadModule(): Promise<typeof import("./acoustIdService")> {
  return await import("./acoustIdService");
}

describe("acoustIdService", () => {
  it("returns null when no API key is configured", async () => {
    delete process.env.ACOUSTID_API_KEY;
    const { lookupRecordingByFingerprint, isAcoustIdConfigured } = await loadModule();
    expect(isAcoustIdConfigured()).toBe(false);
    expect(await lookupRecordingByFingerprint("fp", 200)).toBeNull();
    expect(fetchCalls).toEqual([]);
  });

  it("returns the highest-scoring recording above threshold", async () => {
    fetchHandler = () => ({
      status: 200,
      body: {
        status: "ok",
        results: [
          { score: 0.7, recordings: [{ id: "low-score" }] },
          { score: 0.95, recordings: [{ id: "high-score" }] },
          { score: 0.88, recordings: [{ id: "mid-score" }] }
        ]
      }
    });
    const { lookupRecordingByFingerprint } = await loadModule();
    const result = await lookupRecordingByFingerprint("fp", 200);
    expect(result?.recordingMbid).toBe("high-score");
    expect(result?.score).toBe(0.95);
  });

  it("rejects results below the score threshold", async () => {
    fetchHandler = () => ({
      status: 200,
      body: { status: "ok", results: [{ score: 0.7, recordings: [{ id: "x" }] }] }
    });
    const { lookupRecordingByFingerprint } = await loadModule();
    expect(await lookupRecordingByFingerprint("fp", 200)).toBeNull();
  });

  it("posts the fingerprint and duration to the lookup endpoint", async () => {
    fetchHandler = () => ({
      status: 200,
      body: { status: "ok", results: [{ score: 0.95, recordings: [{ id: "abc" }] }] }
    });
    const { lookupRecordingByFingerprint } = await loadModule();
    await lookupRecordingByFingerprint("FP123", 234.6);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe("https://api.acoustid.org/v2/lookup");
    expect(fetchCalls[0]!.body).toContain("client=test-key");
    expect(fetchCalls[0]!.body).toContain("duration=235");
    expect(fetchCalls[0]!.body).toContain("fingerprint=FP123");
    expect(fetchCalls[0]!.body).toContain("meta=recordings");
  });

  it("caches a successful hit so the next call returns from cache", async () => {
    fetchHandler = () => ({
      status: 200,
      body: { status: "ok", results: [{ score: 0.95, recordings: [{ id: "cached-mbid" }] }] }
    });
    const { lookupRecordingByFingerprint } = await loadModule();
    await lookupRecordingByFingerprint("FP", 200);
    fetchCalls = [];
    const second = await lookupRecordingByFingerprint("FP", 200);
    expect(second?.recordingMbid).toBe("cached-mbid");
    expect(fetchCalls).toEqual([]);
  });

  it("caches a confirmed miss for 7 days", async () => {
    fetchHandler = () => ({ status: 200, body: { status: "ok", results: [] } });
    const { lookupRecordingByFingerprint } = await loadModule();
    expect(await lookupRecordingByFingerprint("FP", 200)).toBeNull();
    fetchCalls = [];
    expect(await lookupRecordingByFingerprint("FP", 200)).toBeNull();
    expect(fetchCalls).toEqual([]);
  });

  it("does NOT cache transient errors (5xx)", async () => {
    fetchHandler = () => ({ status: 503 });
    const { lookupRecordingByFingerprint, flushAcoustIdCache } = await loadModule();
    expect(await lookupRecordingByFingerprint("FP", 200)).toBeNull();
    flushAcoustIdCache();
    expect(fsSync.existsSync(CACHE_FILE)).toBe(false);
  });

  it("does NOT cache transient errors (network throw)", async () => {
    fetchHandler = () => ({ throw: new Error("ECONNRESET") });
    const { lookupRecordingByFingerprint, flushAcoustIdCache } = await loadModule();
    expect(await lookupRecordingByFingerprint("FP", 200)).toBeNull();
    flushAcoustIdCache();
    expect(fsSync.existsSync(CACHE_FILE)).toBe(false);
  });

  it("treats AcoustID error responses as a miss (not transient)", async () => {
    fetchHandler = () => ({
      status: 200,
      body: { status: "error", error: { message: "invalid fingerprint" } }
    });
    const { lookupRecordingByFingerprint, flushAcoustIdCache } = await loadModule();
    expect(await lookupRecordingByFingerprint("FP", 200)).toBeNull();
    flushAcoustIdCache();
    // Misses are written to cache
    expect(fsSync.existsSync(CACHE_FILE)).toBe(true);
  });
});
