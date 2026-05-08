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
    tmpDir: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "musicbrainz-test-"))
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

const CACHE_FILE = path.join(tmpDir, "musicbrainz-genre-cache.json");

type FetchHandler = (url: string) => { status?: number; body?: unknown; throw?: Error };

let fetchHandler: FetchHandler = () => ({ status: 200, body: { recordings: [] } });
let fetchCalls: string[] = [];

beforeEach(async () => {
  vi.resetModules();
  for (const entry of await fs.readdir(tmpDir).catch(() => [])) {
    await fs.rm(path.join(tmpDir, entry), { recursive: true, force: true });
  }
  fetchHandler = () => ({ status: 200, body: { recordings: [] } });
  fetchCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    fetchCalls.push(url);
    const result = fetchHandler(url);
    if (result.throw) throw result.throw;
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status ?? 200,
      headers: { "Content-Type": "application/json" }
    });
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

async function loadModule(): Promise<typeof import("./musicBrainzService")> {
  return await import("./musicBrainzService");
}

function recordingsResponse(recordings: Array<{ score?: number; tags?: string[]; id?: string }>): Record<string, unknown> {
  return {
    recordings: recordings.map((r) => ({
      id: r.id,
      score: r.score,
      tags: (r.tags ?? []).map((name) => ({ name }))
    }))
  };
}

describe("musicBrainzService", () => {
  it("returns matching genres when MB returns a high-score recording", async () => {
    fetchHandler = () => ({ status: 200, body: recordingsResponse([{ score: 95, tags: ["rock", "indie rock"] }]) });
    const { lookupGenre, flushGenreCache } = await loadModule();
    const genres = await lookupGenre("Pearl Jam", "Black");
    expect(genres).toEqual(["Rock", "Indie Rock"]);
    flushGenreCache();
    expect(fsSync.existsSync(CACHE_FILE)).toBe(true);
  });

  it("rejects recordings below the score threshold and treats as a miss", async () => {
    fetchHandler = () => ({ status: 200, body: recordingsResponse([{ score: 70, tags: ["rock"] }]) });
    const { lookupGenre } = await loadModule();
    const genres = await lookupGenre("Some Artist", "Some Title");
    expect(genres).toEqual([]);
  });

  it("does NOT cache transient errors (5xx)", async () => {
    fetchHandler = () => ({ status: 503 });
    const { lookupGenre, flushGenreCache } = await loadModule();
    const first = await lookupGenre("X", "Y");
    expect(first).toEqual([]);
    flushGenreCache();
    // Cache file should not be written for transient errors
    expect(fsSync.existsSync(CACHE_FILE)).toBe(false);
  });

  it("does NOT cache transient errors (network throw)", async () => {
    fetchHandler = () => ({ throw: new Error("ECONNRESET") });
    const { lookupGenre, flushGenreCache } = await loadModule();
    const first = await lookupGenre("X", "Y");
    expect(first).toEqual([]);
    flushGenreCache();
    expect(fsSync.existsSync(CACHE_FILE)).toBe(false);
  });

  it("retries after transient error on next call (no negative cache)", async () => {
    let firstCall = true;
    fetchHandler = () => {
      if (firstCall) {
        firstCall = false;
        return { status: 503 };
      }
      return { status: 200, body: recordingsResponse([{ score: 95, tags: ["pop"] }]) };
    };
    const { lookupGenre } = await loadModule();
    expect(await lookupGenre("X", "Y")).toEqual([]);
    expect(await lookupGenre("X", "Y")).toEqual(["Pop"]);
  });

  it("caches a successful miss (no recording found) and serves it from cache", async () => {
    fetchHandler = () => ({ status: 200, body: { recordings: [] } });
    const { lookupGenre } = await loadModule();
    expect(await lookupGenre("Unknown", "Track")).toEqual([]);
    fetchCalls = [];
    expect(await lookupGenre("Unknown", "Track")).toEqual([]);
    expect(fetchCalls).toEqual([]);
  });

  it("expires cached misses after the TTL", async () => {
    const { lookupGenre, flushGenreCache } = await loadModule();
    fetchHandler = () => ({ status: 200, body: { recordings: [] } });
    expect(await lookupGenre("X", "Y")).toEqual([]);
    flushGenreCache();

    // Mutate the cache file to make the miss appear ancient
    const raw = JSON.parse(fsSync.readFileSync(CACHE_FILE, "utf8")) as Record<string, { genres: string[]; cachedAt: number; status: string }>;
    for (const key of Object.keys(raw)) {
      raw[key]!.cachedAt = 0;
    }
    fsSync.writeFileSync(CACHE_FILE, JSON.stringify(raw), "utf8");

    // New module instance picks up the stale cache
    vi.resetModules();
    const reloaded = await loadModule();
    fetchHandler = () => ({ status: 200, body: recordingsResponse([{ score: 95, tags: ["rock"] }]) });
    expect(await reloaded.lookupGenre("X", "Y")).toEqual(["Rock"]);
  });

  it("migrates the legacy cache format on load", async () => {
    fsSync.mkdirSync(tmpDir, { recursive: true });
    const legacy = {
      "pearl jam|||black": ["Rock", "Grunge"],
      "old miss|||old": []
    };
    fsSync.writeFileSync(CACHE_FILE, JSON.stringify(legacy), "utf8");

    const { lookupGenre, flushGenreCache } = await loadModule();

    // Legacy hit served from cache, no fetch
    fetchCalls = [];
    expect(await lookupGenre("Pearl Jam", "Black")).toEqual(["Rock", "Grunge"]);
    expect(fetchCalls).toEqual([]);

    // Legacy empty migrates to expired miss → re-fetched
    fetchHandler = () => ({ status: 200, body: recordingsResponse([{ score: 95, tags: ["pop"] }]) });
    expect(await lookupGenre("Old Miss", "Old")).toEqual(["Pop"]);

    flushGenreCache();
  });

  it("escapes Lucene special characters in artist and title", async () => {
    fetchHandler = () => ({ status: 200, body: recordingsResponse([{ score: 95, tags: ["rock"] }]) });
    const { lookupGenre } = await loadModule();
    await lookupGenre('AC/DC', 'T.N.T. (Live)');
    expect(fetchCalls).toHaveLength(1);
    const url = fetchCalls[0]!;
    // The slash in AC/DC and the parens in the title must be backslash-escaped
    // in the Lucene query. encodeURIComponent leaves parens unescaped but
    // encodes "/" and "\".
    expect(url).toMatch(/AC%5C%2FDC/);
    expect(url).toMatch(/%5C\(Live%5C\)/);
  });

  it("falls back to a simplified title when the exact title finds nothing", async () => {
    let call = 0;
    fetchHandler = (url) => {
      call++;
      if (call === 1) {
        // First call: exact title with parentheses → no match
        expect(url).toMatch(/Black/);
        expect(url).toMatch(/Live/);
        return { status: 200, body: { recordings: [] } };
      }
      // Second call: simplified title (parentheses stripped)
      expect(url).toMatch(/Black/);
      expect(url).not.toMatch(/Live/);
      return { status: 200, body: recordingsResponse([{ score: 95, tags: ["rock"] }]) };
    };
    const { lookupGenre } = await loadModule();
    expect(await lookupGenre("Pearl Jam", "Black (Live)")).toEqual(["Rock"]);
    expect(call).toBe(2);
  });

  it("coalesces concurrent calls for the same key into a single fetch", async () => {
    let fetchCount = 0;
    fetchHandler = () => {
      fetchCount++;
      return { status: 200, body: recordingsResponse([{ score: 95, tags: ["jazz"] }]) };
    };
    const { lookupGenre } = await loadModule();
    const [a, b, c] = await Promise.all([
      lookupGenre("Miles Davis", "So What"),
      lookupGenre("Miles Davis", "So What"),
      lookupGenre("Miles Davis", "So What")
    ]);
    expect(a).toEqual(["Jazz"]);
    expect(b).toEqual(["Jazz"]);
    expect(c).toEqual(["Jazz"]);
    expect(fetchCount).toBe(1);
  });

  it("writes the cache atomically (no .tmp left over after flush)", async () => {
    fetchHandler = () => ({ status: 200, body: recordingsResponse([{ score: 95, tags: ["rock"] }]) });
    const { lookupGenre, flushGenreCache } = await loadModule();
    await lookupGenre("X", "Y");
    flushGenreCache();
    expect(fsSync.existsSync(CACHE_FILE)).toBe(true);
    expect(fsSync.existsSync(`${CACHE_FILE}.tmp`)).toBe(false);
  });
});
