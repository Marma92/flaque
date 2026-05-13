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

describe("musicBrainzService.lookupRecordingMetadata", () => {
  const RECORDING_MBID = "11111111-1111-4111-8111-111111111111";
  const RELEASE_GROUP_MBID = "22222222-2222-4222-8222-222222222222";
  const ARTIST_MBID = "33333333-3333-4333-8333-333333333333";

  it("returns full metadata with MBIDs and year from the earliest Album release", async () => {
    let phase = 0;
    fetchHandler = (url) => {
      phase++;
      if (phase === 1) {
        return {
          status: 200,
          body: recordingsResponse([{ score: 95, id: RECORDING_MBID, tags: ["rock"] }])
        };
      }
      // Detail fetch — returns 2 album releases (2003 and 2001) + 1 single
      expect(url).toMatch(/inc=[^&]*release-groups/);
      return {
        status: 200,
        body: {
          id: RECORDING_MBID,
          "artist-credit": [{ artist: { id: ARTIST_MBID, name: "Artist" } }],
          releases: [
            {
              id: "rel-1",
              "release-group": {
                id: "rg-2003",
                "first-release-date": "2003-05-01",
                "primary-type": "Album"
              }
            },
            {
              id: "rel-2",
              "release-group": {
                id: RELEASE_GROUP_MBID,
                "first-release-date": "2001-09-15",
                "primary-type": "Album"
              }
            },
            {
              id: "rel-3",
              "release-group": {
                id: "rg-single-1999",
                "first-release-date": "1999-01-01",
                "primary-type": "Single"
              }
            }
          ],
          tags: [{ name: "rock" }],
          genres: []
        }
      };
    };
    const { lookupRecordingMetadata } = await loadModule();
    const result = await lookupRecordingMetadata("Artist", "Song");
    expect(result).not.toBeNull();
    expect(result!.recordingMbid).toBe(RECORDING_MBID);
    expect(result!.releaseGroupMbid).toBe(RELEASE_GROUP_MBID);
    expect(result!.artistMbid).toBe(ARTIST_MBID);
    expect(result!.year).toBe(2001);
    expect(result!.genres).toEqual(["Rock"]);
  });

  it("falls back to non-Album releases when no Album exists", async () => {
    let phase = 0;
    fetchHandler = () => {
      phase++;
      if (phase === 1) {
        return {
          status: 200,
          body: recordingsResponse([{ score: 95, id: RECORDING_MBID }])
        };
      }
      return {
        status: 200,
        body: {
          id: RECORDING_MBID,
          "artist-credit": [{ artist: { id: ARTIST_MBID } }],
          releases: [
            {
              "release-group": {
                id: "rg-ep-2010",
                "first-release-date": "2010-06-01",
                "primary-type": "EP"
              }
            }
          ]
        }
      };
    };
    const { lookupRecordingMetadata } = await loadModule();
    const result = await lookupRecordingMetadata("X", "Y");
    expect(result?.releaseGroupMbid).toBe("rg-ep-2010");
    expect(result?.year).toBe(2010);
  });

  it("returns null on a confirmed miss (no high-score recording)", async () => {
    fetchHandler = () => ({ status: 200, body: recordingsResponse([{ score: 60, tags: ["rock"] }]) });
    const { lookupRecordingMetadata } = await loadModule();
    const result = await lookupRecordingMetadata("X", "Y");
    expect(result).toBeNull();
  });

  it("returns null on transient error and does not cache it", async () => {
    fetchHandler = () => ({ status: 503 });
    const { lookupRecordingMetadata, flushGenreCache } = await loadModule();
    expect(await lookupRecordingMetadata("X", "Y")).toBeNull();
    flushGenreCache();
    expect(fsSync.existsSync(CACHE_FILE)).toBe(false);
  });

  it("re-fetches a Phase 1 cache hit when a richer lookup is requested", async () => {
    // Pre-populate cache with a Phase 1 entry (no richVersion, just genres).
    fsSync.mkdirSync(tmpDir, { recursive: true });
    const phase1 = {
      "artist|||song": {
        cachedAt: Date.now(),
        status: "hit",
        genres: ["Rock"]
      }
    };
    fsSync.writeFileSync(CACHE_FILE, JSON.stringify(phase1), "utf8");

    let phase = 0;
    fetchHandler = () => {
      phase++;
      if (phase === 1) {
        return {
          status: 200,
          body: recordingsResponse([{ score: 95, id: RECORDING_MBID, tags: ["rock"] }])
        };
      }
      return {
        status: 200,
        body: {
          id: RECORDING_MBID,
          "artist-credit": [{ artist: { id: ARTIST_MBID } }],
          releases: [
            {
              "release-group": {
                id: RELEASE_GROUP_MBID,
                "first-release-date": "1999-01-01",
                "primary-type": "Album"
              }
            }
          ]
        }
      };
    };

    const { lookupRecordingMetadata, lookupGenre } = await loadModule();

    // Genre-only lookup is served from the legacy cache without fetching.
    fetchCalls = [];
    expect(await lookupGenre("Artist", "Song")).toEqual(["Rock"]);
    expect(fetchCalls).toEqual([]);

    // Rich lookup detects Phase 1 entry and re-fetches.
    const rich = await lookupRecordingMetadata("Artist", "Song");
    expect(rich?.recordingMbid).toBe(RECORDING_MBID);
    expect(rich?.releaseGroupMbid).toBe(RELEASE_GROUP_MBID);
    expect(rich?.year).toBe(1999);
  });

  it("caches a rich miss so the next call returns from cache without fetching", async () => {
    fetchHandler = () => ({ status: 200, body: { recordings: [] } });
    const { lookupRecordingMetadata } = await loadModule();
    expect(await lookupRecordingMetadata("Unknown", "Unknown")).toBeNull();
    fetchCalls = [];
    expect(await lookupRecordingMetadata("Unknown", "Unknown")).toBeNull();
    expect(fetchCalls).toEqual([]);
  });

  it("caches a rich hit so the next call returns from cache without fetching", async () => {
    let phase = 0;
    fetchHandler = () => {
      phase++;
      if (phase === 1) {
        return { status: 200, body: recordingsResponse([{ score: 95, id: RECORDING_MBID }]) };
      }
      return {
        status: 200,
        body: {
          id: RECORDING_MBID,
          "artist-credit": [{ artist: { id: ARTIST_MBID } }],
          releases: [
            {
              "release-group": {
                id: RELEASE_GROUP_MBID,
                "first-release-date": "1979-03-23",
                "primary-type": "Album"
              }
            }
          ],
          tags: [{ name: "rock" }]
        }
      };
    };
    const { lookupRecordingMetadata } = await loadModule();
    const first = await lookupRecordingMetadata("X", "Y");
    expect(first?.year).toBe(1979);
    fetchCalls = [];
    const second = await lookupRecordingMetadata("X", "Y");
    expect(second?.year).toBe(1979);
    expect(second?.releaseGroupMbid).toBe(RELEASE_GROUP_MBID);
    expect(fetchCalls).toEqual([]);
  });

  it("lookupReleaseGroup picks the best Album match, fetches detail, and caches", async () => {
    let phase = 0;
    fetchHandler = (url) => {
      phase++;
      if (phase === 1) {
        expect(url).toMatch(/\/release-group\?query=/);
        return {
          status: 200,
          body: {
            "release-groups": [
              { id: "rg-non-album", score: 95, "primary-type": "Single", "first-release-date": "1990-01-01" },
              { id: RELEASE_GROUP_MBID, score: 95, "primary-type": "Album", "first-release-date": "1989-09-21" },
              { id: "rg-low", score: 50, "primary-type": "Album", "first-release-date": "1991-01-01" }
            ]
          }
        };
      }
      // Detail fetch for the selected release-group
      expect(url).toMatch(new RegExp(`/release-group/${RELEASE_GROUP_MBID}`));
      return {
        status: 200,
        body: {
          id: RELEASE_GROUP_MBID,
          "first-release-date": "1989-09-21",
          "primary-type": "Album",
          "artist-credit": [{ artist: { id: ARTIST_MBID } }],
          tags: [{ name: "rock" }, { name: "indie rock" }]
        }
      };
    };
    const { lookupReleaseGroup } = await loadModule();
    const result = await lookupReleaseGroup("Pixies", "Doolittle");
    expect(result?.releaseGroupMbid).toBe(RELEASE_GROUP_MBID);
    expect(result?.year).toBe(1989);
    expect(result?.artistMbid).toBe(ARTIST_MBID);
    expect(result?.genres).toEqual(["Rock", "Indie Rock"]);

    // Subsequent call serves from cache (no fetch)
    fetchCalls = [];
    const cached = await lookupReleaseGroup("Pixies", "Doolittle");
    expect(cached?.year).toBe(1989);
    expect(fetchCalls).toEqual([]);
  });

  it("lookupReleaseGroup returns null when no result meets the score threshold", async () => {
    fetchHandler = () => ({
      status: 200,
      body: { "release-groups": [{ id: "rg-low", score: 50, "primary-type": "Album" }] }
    });
    const { lookupReleaseGroup } = await loadModule();
    expect(await lookupReleaseGroup("X", "Y")).toBeNull();
  });

  it("lookupRecordingMetadataByMbid fetches detail directly and caches the result", async () => {
    fetchHandler = (url) => {
      expect(url).toMatch(/\/recording\/11111111-1111-4111-8111-111111111111/);
      expect(url).toMatch(/inc=[^&]*release-groups/);
      return {
        status: 200,
        body: {
          id: RECORDING_MBID,
          "artist-credit": [{ artist: { id: ARTIST_MBID } }],
          releases: [
            {
              "release-group": {
                id: RELEASE_GROUP_MBID,
                "first-release-date": "1989-09-21",
                "primary-type": "Album"
              }
            }
          ],
          tags: [{ name: "rock" }]
        }
      };
    };
    const { lookupRecordingMetadataByMbid } = await loadModule();
    const result = await lookupRecordingMetadataByMbid(RECORDING_MBID);
    expect(result?.recordingMbid).toBe(RECORDING_MBID);
    expect(result?.releaseGroupMbid).toBe(RELEASE_GROUP_MBID);
    expect(result?.year).toBe(1989);
    expect(result?.genres).toEqual(["Rock"]);

    fetchCalls = [];
    const cached = await lookupRecordingMetadataByMbid(RECORDING_MBID);
    expect(cached?.year).toBe(1989);
    expect(fetchCalls).toEqual([]);
  });
});
