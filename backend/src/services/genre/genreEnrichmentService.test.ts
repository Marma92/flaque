import fsSync from "node:fs";
import fs from "node:fs/promises";import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { tmpRoot } = vi.hoisted(() => {
  const fsS = require("node:fs") as typeof import("node:fs");
  const osM = require("node:os") as typeof import("node:os");
  const pathM = require("node:path") as typeof import("node:path");
  return {
    tmpRoot: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "enrich-test-"))
  };
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
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

const RECORDING_MBID = "11111111-1111-4111-8111-111111111111";
const RELEASE_GROUP_MBID = "22222222-2222-4222-8222-222222222222";
const ARTIST_MBID = "33333333-3333-4333-8333-333333333333";

type FetchHandler = (url: string) => { status?: number; body?: unknown };
let fetchHandler: FetchHandler = () => ({ status: 200, body: { recordings: [] } });
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
  fetchHandler = () => ({ status: 200, body: { recordings: [] } });
  fetchCalls = [];
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

async function loadModules() {
  const enrichment = await import("./genreEnrichmentService");
  const overrideStore = await import("../indexer/metadataOverrideStore");
  return { enrichment, overrideStore };
}

function detailResponse(opts: { tags?: string[]; year?: string; albumType?: string } = {}): Record<string, unknown> {
  return {
    id: RECORDING_MBID,
    "artist-credit": [{ artist: { id: ARTIST_MBID } }],
    releases: [
      {
        "release-group": {
          id: RELEASE_GROUP_MBID,
          "first-release-date": opts.year ?? "1979-03-23",
          "primary-type": opts.albumType ?? "Album"
        }
      }
    ],
    tags: (opts.tags ?? ["rock"]).map((name) => ({ name }))
  };
}

describe("enrichTrackMetadata", () => {
  it("uses a stored MBID to skip the name search and go straight to detail", async () => {
    const { enrichment, overrideStore } = await loadModules();

    // Pre-populate the override with the MBID
    await overrideStore.mergeTrackMetadataOverrides({
      "track-1": { mbidRecording: RECORDING_MBID }
    });

    fetchHandler = (url) => {
      // We expect ONE direct /recording/{mbid}?inc=... fetch.
      // No /recording?query=... search.
      expect(url).not.toMatch(/recording\?query=/);
      return { status: 200, body: detailResponse() };
    };

    const result = await enrichment.enrichTrackMetadata({
      id: "track-1",
      artist: "anything",
      title: "anything",
      hasGenre: false,
      hasYear: false,
      hasCover: true,
      source: "single"
    });

    expect(result.genres).toEqual(["Rock"]);
    expect(result.year).toBe(1979);
    expect(result.mbidRecording).toBe(RECORDING_MBID);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toMatch(new RegExp(`/recording/${RECORDING_MBID}`));
  });

  it("marks filled fields as auto in the override", async () => {
    const { enrichment, overrideStore } = await loadModules();

    let phase = 0;
    fetchHandler = () => {
      phase++;
      if (phase === 1) {
        return {
          status: 200,
          body: {
            recordings: [{ id: RECORDING_MBID, score: 95, tags: [{ name: "rock" }] }]
          }
        };
      }
      return { status: 200, body: detailResponse() };
    };

    await enrichment.enrichTrackMetadata({
      id: "track-1",
      artist: "Pearl Jam",
      title: "Black",
      hasGenre: false,
      hasYear: false,
      hasCover: true,
      source: "bulk"
    });

    const overrides = await overrideStore.readTrackMetadataOverrides();
    expect(overrides["track-1"]?.provenance?.genre).toBe("auto");
    expect(overrides["track-1"]?.provenance?.year).toBe("auto");
  });

  it("does NOT overwrite a field marked manual even if currently empty", async () => {
    const { enrichment, overrideStore } = await loadModules();

    // Track has manual genre but no value (e.g. admin cleared it intentionally).
    // We simulate "no genre present in track.tags" via hasGenre=false but
    // mark the genre slot as manual in the override.
    await overrideStore.mergeTrackMetadataOverrides({
      "track-1": {
        title: "Some Title",
        provenance: { genre: "manual" }
      }
    });

    let phase = 0;
    fetchHandler = () => {
      phase++;
      if (phase === 1) {
        return {
          status: 200,
          body: { recordings: [{ id: RECORDING_MBID, score: 95, tags: [{ name: "rock" }] }] }
        };
      }
      return { status: 200, body: detailResponse() };
    };

    const result = await enrichment.enrichTrackMetadata({
      id: "track-1",
      artist: "Pearl Jam",
      title: "Black",
      hasGenre: false,
      hasYear: false,
      hasCover: true,
      source: "bulk"
    });

    // Genre stays untouched (manual provenance gate)
    expect(result.genres).toBeNull();
    const overrides = await overrideStore.readTrackMetadataOverrides();
    expect(overrides["track-1"]?.genre).toBeUndefined();
    expect(overrides["track-1"]?.provenance?.genre).toBe("manual");

    // Year should still be filled (no manual gate for year)
    expect(result.year).toBe(1979);
    expect(overrides["track-1"]?.provenance?.year).toBe("auto");
  });

  it("applyAlbumMetadataToTrack fills year and genre from a ReleaseGroupMetadata, stamping auto", async () => {
    const { enrichment, overrideStore } = await loadModules();

    const rgMeta = {
      releaseGroupMbid: RELEASE_GROUP_MBID,
      year: 1989,
      genres: ["Rock", "Indie Rock"],
      artistMbid: ARTIST_MBID
    };

    const result = await enrichment.applyAlbumMetadataToTrack(
      {
        id: "track-1",
        artist: "Pixies",
        title: "Debaser",
        hasGenre: false,
        hasYear: false,
        hasCover: true, // skip cover fetch
        source: "bulk",
        album: "Doolittle"
      },
      rgMeta
    );

    expect(result.year).toBe(1989);
    expect(result.genres).toEqual(["Rock", "Indie Rock"]);
    expect(result.mbidReleaseGroup).toBe(RELEASE_GROUP_MBID);
    expect(result.mbidArtist).toBe(ARTIST_MBID);

    const overrides = await overrideStore.readTrackMetadataOverrides();
    expect(overrides["track-1"]?.year).toBe(1989);
    expect(overrides["track-1"]?.genre).toEqual(["Rock", "Indie Rock"]);
    expect(overrides["track-1"]?.mbidReleaseGroup).toBe(RELEASE_GROUP_MBID);
    expect(overrides["track-1"]?.mbidArtist).toBe(ARTIST_MBID);
    expect(overrides["track-1"]?.provenance?.year).toBe("auto");
    expect(overrides["track-1"]?.provenance?.genre).toBe("auto");
  });

  it("applyAlbumMetadataToTrack respects manual provenance and does not overwrite", async () => {
    const { enrichment, overrideStore } = await loadModules();

    // Track has manual genre. Cohort offers a different one.
    await overrideStore.mergeTrackMetadataOverrides({
      "track-1": {
        genre: ["Indie"],
        provenance: { genre: "manual" }
      }
    });

    await enrichment.applyAlbumMetadataToTrack(
      {
        id: "track-1",
        artist: "Pixies",
        title: "Debaser",
        hasGenre: true,
        hasYear: false,
        hasCover: true,
        source: "bulk",
        album: "Doolittle"
      },
      {
        releaseGroupMbid: RELEASE_GROUP_MBID,
        year: 1989,
        genres: ["Rock"],
        artistMbid: ARTIST_MBID
      }
    );

    const overrides = await overrideStore.readTrackMetadataOverrides();
    expect(overrides["track-1"]?.genre).toEqual(["Indie"]);
    expect(overrides["track-1"]?.provenance?.genre).toBe("manual");
    // Year still gets filled because no manual gate on it.
    expect(overrides["track-1"]?.year).toBe(1989);
    expect(overrides["track-1"]?.provenance?.year).toBe("auto");
  });

  it("preserves an existing manual provenance entry on subsequent enrichment", async () => {
    const { enrichment, overrideStore } = await loadModules();

    await overrideStore.mergeTrackMetadataOverrides({
      "track-1": {
        title: "Manual Title",
        genre: ["Indie"],
        provenance: { title: "manual", genre: "manual" }
      }
    });

    let phase = 0;
    fetchHandler = () => {
      phase++;
      if (phase === 1) {
        return {
          status: 200,
          body: { recordings: [{ id: RECORDING_MBID, score: 95, tags: [{ name: "rock" }] }] }
        };
      }
      return { status: 200, body: detailResponse() };
    };

    await enrichment.enrichTrackMetadata({
      id: "track-1",
      artist: "Pearl Jam",
      title: "Black",
      hasGenre: true, // existing genre present
      hasYear: false,
      hasCover: true,
      source: "bulk"
    });

    const overrides = await overrideStore.readTrackMetadataOverrides();
    expect(overrides["track-1"]?.provenance?.title).toBe("manual");
    expect(overrides["track-1"]?.provenance?.genre).toBe("manual");
    expect(overrides["track-1"]?.genre).toEqual(["Indie"]);
    // Year was filled with auto provenance
    expect(overrides["track-1"]?.provenance?.year).toBe("auto");
  });
});
