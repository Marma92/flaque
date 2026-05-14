import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { IndexStore } from "../indexer/indexStore";
import type { LibraryIndex, Track } from "../../types/library";

const { tmpRoot } = vi.hoisted(() => {
  const fsS = require("node:fs") as typeof import("node:fs");
  const osM = require("node:os") as typeof import("node:os");
  const pathM = require("node:path") as typeof import("node:path");
  return { tmpRoot: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "reenrich-test-")) };
});

const cacheRootDir = path.join(tmpRoot, "cache");
const indexRootDir = path.join(tmpRoot, "index");
const coversRootDir = path.join(tmpRoot, "covers");
const sharedMusicRootDir = path.join(tmpRoot, "music");
const configRootDir = path.join(tmpRoot, "config");
const overridesFile = path.join(indexRootDir, "track-metadata-overrides.json");

vi.mock("../../utils/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths")>()),
  cacheRoot: cacheRootDir,
  indexRoot: indexRootDir,
  coversRoot: coversRootDir,
  sharedMusicRoot: sharedMusicRootDir,
  configRoot: configRootDir,
  metadataOverridesFilePath: overridesFile
}));

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

vi.mock("../storage/coverService", () => ({
  findCoverFileByTrackId: vi.fn(async () => null)
}));

vi.mock("../storage/storageService", () => ({
  resolveTrackAbsolutePath: (relPath: string) => `/tmp/fake/${relPath}`
}));

const REC_MBID = "11111111-1111-4111-8111-111111111111";
const RG_MBID = "22222222-2222-4222-8222-222222222222";

type FetchHandler = (url: string) => { status?: number; body?: unknown };
let fetchHandler: FetchHandler = () => ({ status: 200, body: {} });

beforeEach(async () => {
  vi.resetModules();
  for (const dir of [cacheRootDir, indexRootDir, coversRootDir, sharedMusicRootDir, configRootDir]) {
    if (fsSync.existsSync(dir)) {
      for (const entry of await fs.readdir(dir).catch(() => [])) {
        await fs.rm(path.join(dir, entry), { recursive: true, force: true });
      }
    }
  }
  fetchHandler = () => ({ status: 200, body: {} });
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
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

function recordingSearchResponse(): Record<string, unknown> {
  return { recordings: [{ id: REC_MBID, score: 95, tags: [{ name: "rock" }] }] };
}

function recordingDetailResponse(genres: string[] = ["rock"]): Record<string, unknown> {
  return {
    id: REC_MBID,
    "artist-credit": [{ artist: { id: "33333333-3333-4333-8333-333333333333" } }],
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

describe("reEnrichTrack", () => {
  it("returns empty result when the track has no artist or title", async () => {
    const enrichment = await import("./genreEnrichmentService");
    const track = makeTrack("t1", {}); // no artist/title
    const result = await enrichment.reEnrichTrack(track);
    expect(result.genres).toBeNull();
    expect(result.year).toBeNull();
    expect(result.mbidRecording).toBeNull();
  });

  it("invalidates the (artist,title) cache entry so a fresh MB call happens", async () => {
    const enrichment = await import("./genreEnrichmentService");
    const mb = await import("./musicBrainzService");

    let calls = 0;
    fetchHandler = (url) => {
      if (url.includes("coverartarchive.org")) return { status: 404 };
      if (url.includes("recording?query=")) {
        calls++;
        return { status: 200, body: recordingSearchResponse() };
      }
      if (url.includes(`recording/${REC_MBID}`)) {
        return { status: 200, body: recordingDetailResponse() };
      }
      return { status: 404 };
    };

    const track = makeTrack("t1", { artist: "Pixies", title: "Debaser" });

    // Prime the cache with a rich hit.
    await mb.lookupRecordingMetadata("Pixies", "Debaser");
    expect(calls).toBe(1);

    // A second plain lookup hits the cache.
    await mb.lookupRecordingMetadata("Pixies", "Debaser");
    expect(calls).toBe(1);

    // reEnrich should drop the cache entry and trigger another MB roundtrip.
    await enrichment.reEnrichTrack(track);
    expect(calls).toBe(2);
  });

  it("rebuilds the index when metadata was written", async () => {
    const enrichment = await import("./genreEnrichmentService");

    fetchHandler = (url) => {
      if (url.includes("coverartarchive.org")) return { status: 404 };
      if (url.includes("recording?query=")) return { status: 200, body: recordingSearchResponse() };
      if (url.includes(`recording/${REC_MBID}`)) return { status: 200, body: recordingDetailResponse() };
      return { status: 404 };
    };

    const track = makeTrack("t1", { artist: "Pixies", title: "Debaser" });
    const store = makeStore([track]);

    await enrichment.reEnrichTrack(track, store);

    const rebuild = (store as unknown as { rebuild: ReturnType<typeof vi.fn> }).rebuild;
    // rebuild was invoked because new metadata was written.
    expect(rebuild).toHaveBeenCalled();
  });

  it("does NOT rebuild the index when no metadata was written", async () => {
    const enrichment = await import("./genreEnrichmentService");

    // MB returns nothing → nothing gets written.
    fetchHandler = (url) => {
      if (url.includes("coverartarchive.org")) return { status: 404 };
      if (url.includes("recording?query=")) return { status: 200, body: { recordings: [] } };
      return { status: 404 };
    };

    const track = makeTrack("t1", { artist: "Nobody", title: "Nothing" });
    const store = makeStore([track]);

    await enrichment.reEnrichTrack(track, store);

    const rebuild = (store as unknown as { rebuild: ReturnType<typeof vi.fn> }).rebuild;
    expect(rebuild).not.toHaveBeenCalled();
  });
});

describe("reapplySynonymsToOverrides", () => {
  it("re-normalizes existing genre overrides and reports counts", async () => {
    const enrichment = await import("./genreEnrichmentService");
    const overrideStore = await import("../indexer/metadataOverrideStore");
    const synonyms = await import("./genreSynonymService");

    // Seed: track 1 has a label that's a known synonym ("hiphop" → "Hip-Hop").
    // Track 2 has an already-canonical genre.
    await overrideStore.mergeTrackMetadataOverrides({
      "t1": { genre: ["hiphop"] },
      "t2": { genre: ["Rock"] },
      "t3": {} // no genre — should be skipped entirely
    });

    // Sanity-check the default synonym table is loaded.
    expect(synonyms.normalizeGenreLabel("hiphop")).toBe("Hip-Hop");

    const store = makeStore([
      makeTrack("t1", { artist: "A", title: "A" }),
      makeTrack("t2", { artist: "B", title: "B" }),
      makeTrack("t3", { artist: "C", title: "C" })
    ]);

    const result = await enrichment.reapplySynonymsToOverrides(store);
    expect(result.scanned).toBe(2); // t3 was skipped (no genre)
    expect(result.updated).toBe(1); // only t1 changed
  });

  it("rebuilds the index only when at least one track changed", async () => {
    const enrichment = await import("./genreEnrichmentService");
    const overrideStore = await import("../indexer/metadataOverrideStore");

    // All overrides are already canonical → nothing to do.
    await overrideStore.mergeTrackMetadataOverrides({
      "t1": { genre: ["Rock"] },
      "t2": { genre: ["Jazz"] }
    });

    const store = makeStore([makeTrack("t1"), makeTrack("t2")]);
    const result = await enrichment.reapplySynonymsToOverrides(store);
    expect(result.updated).toBe(0);

    const rebuild = (store as unknown as { rebuild: ReturnType<typeof vi.fn> }).rebuild;
    expect(rebuild).not.toHaveBeenCalled();
  });

  it("returns zero counts when there are no overrides at all", async () => {
    const enrichment = await import("./genreEnrichmentService");
    const store = makeStore([makeTrack("t1")]);
    const result = await enrichment.reapplySynonymsToOverrides(store);
    expect(result).toEqual({ scanned: 0, updated: 0 });
  });
});
