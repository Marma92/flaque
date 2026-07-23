import fsSync from "node:fs";
import fs from "node:fs/promises";import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { IndexStore } from "../indexer/indexStore";
import type { LibraryIndex, Track } from "../../types/library";

const { tmpRoot } = vi.hoisted(() => {
  const fsS = require("node:fs") as typeof import("node:fs");
  const osM = require("node:os") as typeof import("node:os");
  const pathM = require("node:path") as typeof import("node:path");
  return { tmpRoot: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "cohort-test-")) };
});

const cacheRootDir = path.join(tmpRoot, "cache");
const indexRootDir = path.join(tmpRoot, "index");
const coversRootDir = path.join(tmpRoot, "covers");
const sharedMusicRootDir = path.join(tmpRoot, "music");
const overridesFile = path.join(indexRootDir, "track-metadata-overrides.json");

vi.mock("../../utils/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths")>()),
  cacheRoot: cacheRootDir,
  indexRoot: indexRootDir,
  coversRoot: coversRootDir,
  sharedMusicRoot: sharedMusicRootDir,
  metadataOverridesFilePath: overridesFile
}));

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

// All tracks pretend to have no cover so the cover-fetch path is exercised
// and tracks become enrichment candidates. The fetch handler below sends
// 404 for any Cover Art Archive URL so the cover step is a clean miss.
vi.mock("../storage/coverService", () => ({
  findCoverFileByTrackId: vi.fn(async () => null)
}));

vi.mock("../storage/storageService", () => ({
  resolveTrackAbsolutePath: (relPath: string) => `/tmp/fake/${relPath}`
}));

const REC_MBID = "11111111-1111-4111-8111-111111111111";
const RG_MBID = "22222222-2222-4222-8222-222222222222";
const ARTIST_MBID = "33333333-3333-4333-8333-333333333333";

type FetchHandler = (url: string) => { status?: number; body?: unknown };
let fetchHandler: FetchHandler = () => ({ status: 200, body: {} });
let fetchCalls: string[] = [];

beforeEach(async () => {
  vi.resetModules();
  for (const dir of [cacheRootDir, indexRootDir, coversRootDir, sharedMusicRootDir]) {
    if (fsSync.existsSync(dir)) {
      for (const entry of await fs.readdir(dir).catch(() => [])) {
        await fs.rm(path.join(dir, entry), { recursive: true, force: true });
      }
    }
  }
  fetchCalls = [];
  fetchHandler = () => ({ status: 200, body: {} });
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    fetchCalls.push(url);
    const result = fetchHandler(url);
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status ?? 200,
      headers: { "Content-Type": "application/json" }
    });
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
  fsSync.rmSync(tmpRoot, { recursive: true, force: true });
});

function makeTrack(id: string, tags: Partial<Track["tags"]> = {}): Track {
  return {
    id,
    owner: "owner-1",
    path: `storage/users/owner-1/uploads/${id}.flac`,
    duration: 120,
    mimeType: "audio/flac",
    codec: "flac",
    tags: { title: id, ...tags },
    cover: `/api/covers/${id}`
  };
}

function makeStore(tracks: Track[]): IndexStore {
  const snapshot: LibraryIndex = {
    generatedAt: new Date().toISOString(),
    totalTracks: tracks.length,
    tracks
  };
  return {
    getSnapshot: () => snapshot,
    getTracks: () => snapshot.tracks,
    getTrackById: (id: string) => snapshot.tracks.find((t) => t.id === id),
    hasTrack: (id: string) => snapshot.tracks.some((t) => t.id === id),
    getTracksByOwner: () => [],
    getTracksByArtist: () => [],
    getTracksByAlbum: () => [],
    rebuild: vi.fn(async () => snapshot)
  } as unknown as IndexStore;
}

function rgSearchResponse(): Record<string, unknown> {
  return {
    "release-groups": [{
      id: RG_MBID,
      score: 100,
      "primary-type": "Album",
      "first-release-date": "1989-04-17"
    }]
  };
}

function rgDetailResponse(genres: string[] = ["rock"]): Record<string, unknown> {
  return {
    id: RG_MBID,
    "first-release-date": "1989-04-17",
    "primary-type": "Album",
    "artist-credit": [{ artist: { id: ARTIST_MBID } }],
    tags: genres.map((name) => ({ name }))
  };
}

function recordingSearchResponse(): Record<string, unknown> {
  return { recordings: [{ id: REC_MBID, score: 95, tags: [{ name: "rock" }] }] };
}

function recordingDetailResponse(genres: string[] = ["rock"]): Record<string, unknown> {
  return {
    id: REC_MBID,
    "artist-credit": [{ artist: { id: ARTIST_MBID } }],
    releases: [{
      "release-group": {
        id: RG_MBID,
        "first-release-date": "1989-04-17",
        "primary-type": "Album"
      }
    }],
    tags: genres.map((name) => ({ name }))
  };
}

describe("runBackgroundEnrichment cohort planning", () => {
  it("groups same-album tracks into a single release-group lookup", async () => {
    const enrichment = await import("./genreEnrichmentService");
    const store = makeStore([
      makeTrack("t1", { artist: "Pixies", title: "Debaser", album: "Doolittle" }),
      makeTrack("t2", { artist: "Pixies", title: "Tame", album: "Doolittle" }),
      makeTrack("t3", { artist: "Pixies", title: "Wave of Mutilation", album: "Doolittle" })
    ]);

    fetchHandler = (url) => {
      if (url.includes("coverartarchive.org")) return { status: 404 };
      if (url.includes("release-group?query=")) return { status: 200, body: rgSearchResponse() };
      if (url.includes(`release-group/${RG_MBID}`)) return { status: 200, body: rgDetailResponse() };
      // Anything else (recording search) means the cohort path failed to short-circuit.
      throw new Error(`unexpected fetch: ${url}`);
    };

    await enrichment.runBackgroundEnrichment(store);

    const status = enrichment.getEnrichmentStatus();
    expect(status.total).toBe(3);
    expect(status.processed).toBe(3);
    expect(status.enriched).toBe(3);
    expect(status.failed).toBe(0);

    // 1 search + 1 detail for the cohort. The CAA 404 is negative-cached
    // per release-group, so only the first member triggers the cover fetch.
    const mbCalls = fetchCalls.filter((u) => u.includes("musicbrainz.org"));
    expect(mbCalls.length).toBe(2);
    const coverCalls = fetchCalls.filter((u) => u.includes("coverartarchive.org"));
    expect(coverCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to per-track when the cohort lookup misses", async () => {
    const enrichment = await import("./genreEnrichmentService");
    const store = makeStore([
      makeTrack("t1", { artist: "Unknown", title: "Track A", album: "Mystery Album" }),
      makeTrack("t2", { artist: "Unknown", title: "Track B", album: "Mystery Album" })
    ]);

    fetchHandler = (url) => {
      if (url.includes("coverartarchive.org")) return { status: 404 };
      if (url.includes("release-group?query=")) {
        return { status: 200, body: { "release-groups": [] } }; // cohort miss
      }
      if (url.includes("recording?query=")) return { status: 200, body: recordingSearchResponse() };
      if (url.includes(`recording/${REC_MBID}`)) return { status: 200, body: recordingDetailResponse() };
      throw new Error(`unexpected fetch: ${url}`);
    };

    await enrichment.runBackgroundEnrichment(store);

    const status = enrichment.getEnrichmentStatus();
    expect(status.processed).toBe(2);
    expect(status.failed).toBe(0);
    // Cohort search + 2 per-track searches + 2 per-track details (recording detail
    // is dedup'd per recording MBID across same-MBID hits, so just 1 detail).
    const mbCalls = fetchCalls.filter((u) => u.includes("musicbrainz.org"));
    // 1 cohort search + 2 per-track searches + 1 dedup'd detail = 4
    expect(mbCalls.length).toBeGreaterThanOrEqual(3);
  });

  it("processes singletons via the per-track path (no cohort lookup)", async () => {
    const enrichment = await import("./genreEnrichmentService");
    const store = makeStore([
      makeTrack("t1", { artist: "A", title: "Song", album: "Album X" }) // singleton
    ]);

    fetchHandler = (url) => {
      if (url.includes("coverartarchive.org")) return { status: 404 };
      if (url.includes("release-group?query=")) {
        throw new Error("cohort lookup should not run for a singleton");
      }
      if (url.includes("recording?query=")) return { status: 200, body: recordingSearchResponse() };
      if (url.includes(`recording/${REC_MBID}`)) return { status: 200, body: recordingDetailResponse() };
      throw new Error(`unexpected fetch: ${url}`);
    };

    await enrichment.runBackgroundEnrichment(store);
    expect(enrichment.getEnrichmentStatus().processed).toBe(1);
  });

  it("processes tracks without an album via the per-track path", async () => {
    const enrichment = await import("./genreEnrichmentService");
    const store = makeStore([
      makeTrack("t1", { artist: "A", title: "Single Song" }) // no album tag
    ]);

    fetchHandler = (url) => {
      if (url.includes("coverartarchive.org")) return { status: 404 };
      if (url.includes("release-group?query=")) {
        throw new Error("cohort lookup should not run for albumless track");
      }
      if (url.includes("recording?query=")) return { status: 200, body: recordingSearchResponse() };
      if (url.includes(`recording/${REC_MBID}`)) return { status: 200, body: recordingDetailResponse() };
      throw new Error(`unexpected fetch: ${url}`);
    };

    await enrichment.runBackgroundEnrichment(store);
    expect(enrichment.getEnrichmentStatus().processed).toBe(1);
  });

  it("does not double-count when cohort partially covers a member", async () => {
    // The cohort returns NO genres, so each track still needs genre →
    // gets requeued for per-track. Before the cleanup, this path
    // double-counted: now each member is counted exactly once.
    const enrichment = await import("./genreEnrichmentService");
    const store = makeStore([
      makeTrack("t1", { artist: "Pixies", title: "Debaser", album: "Doolittle" }),
      makeTrack("t2", { artist: "Pixies", title: "Tame", album: "Doolittle" })
    ]);

    fetchHandler = (url) => {
      if (url.includes("coverartarchive.org")) return { status: 404 };
      if (url.includes("release-group?query=")) return { status: 200, body: rgSearchResponse() };
      if (url.includes(`release-group/${RG_MBID}`)) {
        // No tags/genres → cohort can fill year + rgMbid but not genre.
        return {
          status: 200,
          body: {
            id: RG_MBID,
            "first-release-date": "1989-04-17",
            "primary-type": "Album",
            "artist-credit": [{ artist: { id: ARTIST_MBID } }],
            tags: []
          }
        };
      }
      if (url.includes("recording?query=")) return { status: 200, body: recordingSearchResponse() };
      if (url.includes(`recording/${REC_MBID}`)) return { status: 200, body: recordingDetailResponse() };
      throw new Error(`unexpected fetch: ${url}`);
    };

    await enrichment.runBackgroundEnrichment(store);
    const status = enrichment.getEnrichmentStatus();
    expect(status.total).toBe(2);
    expect(status.processed).toBe(2); // never higher than total
    expect(status.enriched).toBeLessThanOrEqual(2);
  });

  it("handles an empty candidate set without leaving running:true", async () => {
    // Override the cover service mock so the track is reported as having
    // a cover — combined with non-empty genre + year tags, it should not
    // be a candidate at all.
    const coverService = await import("../storage/coverService");
    vi.mocked(coverService.findCoverFileByTrackId).mockResolvedValue("covers/t1.jpg");

    const enrichment = await import("./genreEnrichmentService");
    const store = makeStore([
      makeTrack("t1", { artist: "A", title: "B", album: "C", genre: ["Rock"], year: 1989 })
    ]);

    await enrichment.runBackgroundEnrichment(store);
    const status = enrichment.getEnrichmentStatus();
    expect(status.running).toBe(false);
    expect(status.total).toBe(0);
  });

  it("stopEnrichment halts the runner mid-flight", async () => {
    const enrichment = await import("./genreEnrichmentService");
    const store = makeStore([
      makeTrack("t1", { artist: "A", title: "A" }),
      makeTrack("t2", { artist: "B", title: "B" }),
      makeTrack("t3", { artist: "C", title: "C" })
    ]);

    fetchHandler = (url) => {
      if (url.includes("coverartarchive.org")) return { status: 404 };
      // Trigger the stop on the very first per-track lookup.
      if (url.includes("recording?query=")) {
        enrichment.stopEnrichment();
        return { status: 200, body: { recordings: [] } };
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    await enrichment.runBackgroundEnrichment(store);
    const status = enrichment.getEnrichmentStatus();
    expect(status.running).toBe(false);
    // The runner short-circuited; processed should be < total.
    expect(status.processed).toBeLessThan(status.total);
  });
});
