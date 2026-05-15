import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pingEmbedder, requestEmbedding } from "./embedderClient";

type FetchArgs = Parameters<typeof fetch>;
type FetchHandler = (...args: FetchArgs) => Promise<Response> | Response;

function mockFetch(handler: FetchHandler): void {
  vi.stubGlobal("fetch", vi.fn(handler) as typeof fetch);
}

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
}

describe("embedderClient", () => {
  beforeEach(() => {
    delete process.env.AUDIO_EMBEDDER_URL;
    delete process.env.AUDIO_EMBEDDER_TIMEOUT_MS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("requestEmbedding", () => {
    it("returns the parsed vector on a happy-path response", async () => {
      const vec = Array.from({ length: 512 }, (_, i) => (i % 7) * 0.001);
      mockFetch(async () => jsonResponse({ vec, dim: 512, model: "stub" }));
      const result = await requestEmbedding("/abs/path/track.mp3");
      expect(result).not.toBeNull();
      expect(result?.dim).toBe(512);
      expect(result?.vec).toHaveLength(512);
      expect(result?.model).toBe("stub");
    });

    it("POSTs to /embed with the absolute path in the JSON body", async () => {
      const calls: { url: string; init: RequestInit }[] = [];
      mockFetch(async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} });
        return jsonResponse({ vec: [0, 1], dim: 2, model: "stub" });
      });
      await requestEmbedding("/abs/path/track.mp3");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe("http://127.0.0.1:7001/embed");
      expect(calls[0]?.init.method).toBe("POST");
      expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
        absolutePath: "/abs/path/track.mp3"
      });
    });

    it("honors AUDIO_EMBEDDER_URL and strips trailing slashes", async () => {
      process.env.AUDIO_EMBEDDER_URL = "http://example.local:9000/";
      const calls: string[] = [];
      mockFetch(async (input) => {
        calls.push(String(input));
        return jsonResponse({ vec: [0], dim: 1, model: "stub" });
      });
      await requestEmbedding("/x");
      expect(calls[0]).toBe("http://example.local:9000/embed");
    });

    it("returns null for empty paths without calling fetch", async () => {
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher as unknown as typeof fetch);
      const result = await requestEmbedding("");
      expect(result).toBeNull();
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("returns null on network errors", async () => {
      mockFetch(async () => {
        throw new Error("ECONNREFUSED");
      });
      const result = await requestEmbedding("/abs/path/track.mp3");
      expect(result).toBeNull();
    });

    it("returns null on non-OK HTTP status", async () => {
      mockFetch(async () => new Response("nope", { status: 500 }));
      const result = await requestEmbedding("/abs/path/track.mp3");
      expect(result).toBeNull();
    });

    it("returns null when the body isn't valid JSON", async () => {
      mockFetch(async () => new Response("not json", { status: 200 }));
      const result = await requestEmbedding("/abs/path/track.mp3");
      expect(result).toBeNull();
    });

    it("rejects responses whose vec length does not match dim", async () => {
      mockFetch(async () =>
        jsonResponse({ vec: [0.1, 0.2], dim: 512, model: "stub" })
      );
      const result = await requestEmbedding("/abs/path/track.mp3");
      expect(result).toBeNull();
    });

    it("rejects responses with non-finite numbers in vec", async () => {
      mockFetch(async () =>
        jsonResponse({ vec: [0.1, Number.NaN], dim: 2, model: "stub" })
      );
      const result = await requestEmbedding("/abs/path/track.mp3");
      expect(result).toBeNull();
    });
  });

  describe("pingEmbedder", () => {
    it("returns ok/model on healthy response", async () => {
      mockFetch(async () => jsonResponse({ ok: true, model: "stub" }));
      const result = await pingEmbedder();
      expect(result).toEqual({ ok: true, model: "stub" });
    });

    it("returns null when health check fails to connect", async () => {
      mockFetch(async () => {
        throw new Error("ECONNREFUSED");
      });
      const result = await pingEmbedder();
      expect(result).toBeNull();
    });

    it("returns null when health body is malformed", async () => {
      mockFetch(async () => jsonResponse({ status: "fine" }));
      const result = await pingEmbedder();
      expect(result).toBeNull();
    });

    it("hits /healthz at the configured base URL", async () => {
      process.env.AUDIO_EMBEDDER_URL = "http://other.host:8000";
      const calls: string[] = [];
      mockFetch(async (input) => {
        calls.push(String(input));
        return jsonResponse({ ok: true, model: "stub" });
      });
      await pingEmbedder();
      expect(calls[0]).toBe("http://other.host:8000/healthz");
    });
  });
});
