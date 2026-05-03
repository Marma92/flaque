import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

vi.mock("../../utils/paths", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../utils/paths")>();
  return {
    ...original,
    get dataRoot() { return path.join(tmpDir, "data"); },
    get usersStorageRoot() { return path.join(tmpDir, "data", "storage", "users"); },
    get configRoot() { return path.join(tmpDir, "data", "config"); }
  };
});

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock("../genre/genreSynonymService", () => ({
  normalizeGenreLabel: (g: string) => g
}));

import type { Track } from "../../types/library";
import type { IndexStore } from "../indexer/indexStore";

function makeTrack(overrides: Partial<Track> & { id: string }): Track {
  return {
    owner: "user-1",
    path: `/music/${overrides.id}.flac`,
    duration: 240,
    mimeType: "audio/flac",
    codec: "flac",
    tags: {},
    ...overrides
  };
}

function makeMockIndexStore(tracks: Track[]): IndexStore {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const byArtist = new Map<string, Track[]>();
  const byAlbum = new Map<string, Track[]>();
  for (const t of tracks) {
    const artist = (t.tags.artist ?? "Unknown").toLowerCase();
    const aList = byArtist.get(artist) ?? [];
    aList.push(t);
    byArtist.set(artist, aList);

    const album = (t.tags.album ?? "").toLowerCase();
    if (album) {
      const list = byAlbum.get(album) ?? [];
      list.push(t);
      byAlbum.set(album, list);
    }
  }

  return {
    getSnapshot: () => ({ tracks, totalTracks: tracks.length, generatedAt: "", playlists: [] }),
    getTrackById: (id: string) => byId.get(id),
    getTracksByArtist: (artist: string) => byArtist.get(artist.toLowerCase()) ?? [],
    getTracksByAlbum: (album: string) => byAlbum.get(album.toLowerCase()) ?? [],
    hasTrack: (id: string) => byId.has(id)
  } as unknown as IndexStore;
}

describe("forYouPlaylistService", () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "foryou-test-"));
    await fs.mkdir(path.join(tmpDir, "data", "config"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, "data", "storage", "users"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("skips generation when user has too few plays", async () => {
    const { generateForYouPlaylists } = await import("./forYouPlaylistService");

    const tracks = Array.from({ length: 30 }, (_, i) =>
      makeTrack({
        id: `track-${i}`,
        tags: { artist: `Artist ${i % 5}`, genre: ["Rock"], year: 2000 }
      })
    );
    const indexStore = makeMockIndexStore(tracks);

    const result = await generateForYouPlaylists("user-1", indexStore);
    expect(result).toEqual([]);
  });

  it("generates playlists when user meets thresholds", async () => {
    const { generateForYouPlaylists } = await import("./forYouPlaylistService");
    const { ensureDir, writeJsonAtomic } = await import("../../utils/fs");

    const artists = ["Pink Floyd", "Led Zeppelin", "Deep Purple", "Black Sabbath", "Jethro Tull"];
    const tracks: Track[] = [];

    for (let i = 0; i < 60; i++) {
      const artist = artists[i % 5]!;
      tracks.push(
        makeTrack({
          id: `track-${i}`,
          tags: { artist, genre: ["Rock"], year: 1970 + (i % 10) }
        })
      );
    }

    const indexStore = makeMockIndexStore(tracks);

    const playCountsDir = path.join(tmpDir, "data", "storage", "users", "user-1");
    await ensureDir(playCountsDir);

    const playCounts: Record<string, { count: number; lastPlayedAt: string }> = {};
    for (let i = 0; i < 30; i++) {
      playCounts[`track-${i}`] = { count: 2, lastPlayedAt: "2026-04-01T00:00:00Z" };
    }
    await writeJsonAtomic(path.join(playCountsDir, "play-counts.json"), { tracks: playCounts });

    const result = await generateForYouPlaylists("user-1", indexStore);

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(6);

    for (const playlist of result) {
      expect(playlist.id).toMatch(/^for-you:/);
      // Name varies depending on era spread, peer share, and artist count.
      expect(playlist.name).toMatch(/(Because you listen to|More|Around|with|& friends)/);
      expect(playlist.trackIds.length).toBeGreaterThan(0);
    }
  });

  it("dismisses and stores dismissal", async () => {
    const { dismissForYouPlaylist, getUserDismissals } = await import("./forYouPlaylistService");

    await dismissForYouPlaylist("user-1", "for-you:pink-floyd");

    const dismissals = await getUserDismissals("user-1");
    expect(dismissals.has("for-you:pink-floyd")).toBe(true);
    expect(dismissals.has("for-you:led-zeppelin")).toBe(false);
  });

  it("writes a trace file with the expected shape on regenerate", async () => {
    const { regenerateForYouPlaylists, loadForYouTrace } = await import("./forYouPlaylistService");
    const { ensureDir, writeJsonAtomic } = await import("../../utils/fs");

    const artists = ["Pink Floyd", "Led Zeppelin", "Deep Purple", "Black Sabbath", "Jethro Tull"];
    const tracks: Track[] = [];
    for (let i = 0; i < 60; i++) {
      const artist = artists[i % 5]!;
      tracks.push(
        makeTrack({
          id: `track-${i}`,
          tags: { artist, genre: ["Rock"], year: 1970 + (i % 10) }
        })
      );
    }
    const indexStore = makeMockIndexStore(tracks);

    const playCountsDir = path.join(tmpDir, "data", "storage", "users", "user-1");
    await ensureDir(playCountsDir);
    const playCounts: Record<string, { count: number; lastPlayedAt: string }> = {};
    for (let i = 0; i < 30; i++) {
      playCounts[`track-${i}`] = { count: 2, lastPlayedAt: "2026-04-01T00:00:00Z" };
    }
    await writeJsonAtomic(path.join(playCountsDir, "play-counts.json"), { tracks: playCounts });

    await regenerateForYouPlaylists("user-1", indexStore);

    const trace = await loadForYouTrace("user-1");
    expect(trace).not.toBeNull();
    expect(trace!.userId).toBe("user-1");
    expect(trace!.totalPlays).toBe(60);
    expect(trace!.distinctArtists).toBeGreaterThanOrEqual(3);
    expect(trace!.seedSelection.candidates.length).toBeGreaterThan(0);
    expect(trace!.seedSelection.candidates[0]!.sources).toContain("top-artist");
    expect(trace!.seedSelection.chosen.length).toBeGreaterThan(0);
    expect(trace!.playlists.length).toBeGreaterThan(0);
    for (const entry of trace!.playlists) {
      expect(entry.profile.genres).toBeDefined();
      expect(entry.candidatePoolSize).toBeGreaterThanOrEqual(0);
      if (entry.playlistId) {
        expect(entry.finalTrackIds.length).toBeGreaterThan(0);
      }
    }
    expect(trace!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("trace records skip reason when user is below thresholds", async () => {
    const { regenerateForYouPlaylists, loadForYouTrace } = await import("./forYouPlaylistService");

    const tracks = Array.from({ length: 5 }, (_, i) =>
      makeTrack({ id: `t-${i}`, tags: { artist: `A${i}`, genre: ["Rock"], year: 2000 } })
    );
    const indexStore = makeMockIndexStore(tracks);

    await regenerateForYouPlaylists("user-1", indexStore);
    const trace = await loadForYouTrace("user-1");
    expect(trace).not.toBeNull();
    expect(trace!.skipReason).toBe("below-min-plays");
    expect(trace!.playlists).toEqual([]);
  });

  it("saves and loads for-you playlists", async () => {
    const { saveForYouPlaylists, loadForYouPlaylists } = await import("./forYouPlaylistService");

    const playlists = [
      {
        id: "for-you:pink-floyd",
        name: "Because you listen to Pink Floyd",
        seedArtist: "Pink Floyd",
        trackIds: ["t1", "t2", "t3"],
        trackCount: 3,
        generatedAt: "2026-04-01T00:00:00Z"
      }
    ];

    await saveForYouPlaylists("user-1", playlists);
    const loaded = await loadForYouPlaylists("user-1");

    expect(loaded.length).toBe(1);
    expect(loaded[0]!.id).toBe("for-you:pink-floyd");
    expect(loaded[0]!.trackIds).toEqual(["t1", "t2", "t3"]);
  });

  it("enforces the per-peer-artist cap inside a playlist", async () => {
    const { generateForYouPlaylists } = await import("./forYouPlaylistService");
    const { ensureDir, writeJsonAtomic } = await import("../../utils/fs");

    // Seed: Pink Floyd (10 tracks). Peer pool: One dominant peer artist with
    // 30 candidate tracks, plus a few other peer artists. Without the cap the
    // dominant peer would swallow the playlist; with cap=4 we expect ≤4 from any
    // single peer.
    const tracks: Track[] = [];
    for (let i = 0; i < 10; i++) {
      tracks.push(makeTrack({ id: `seed-${i}`, tags: { artist: "Pink Floyd", album: `pf-${i}`, genre: ["Rock"], year: 1973 } }));
    }
    for (let i = 0; i < 30; i++) {
      tracks.push(makeTrack({ id: `dom-${i}`, tags: { artist: "Dominant Band", album: `db-${i}`, genre: ["Rock"], year: 1973 } }));
    }
    for (let i = 0; i < 6; i++) {
      tracks.push(makeTrack({ id: `other-${i}`, tags: { artist: `Other ${i}`, album: `o-${i}`, genre: ["Rock"], year: 1973 } }));
    }

    const indexStore = makeMockIndexStore(tracks);
    const dir = path.join(tmpDir, "data", "storage", "users", "user-1");
    await ensureDir(dir);
    const playCounts: Record<string, { count: number; lastPlayedAt: string }> = {};
    for (let i = 0; i < 10; i++) playCounts[`seed-${i}`] = { count: 5, lastPlayedAt: "2026-04-01T00:00:00Z" };
    // Spread plays across 3+ distinct artists so MIN_DISTINCT_ARTISTS is met.
    playCounts["other-0"] = { count: 1, lastPlayedAt: "2026-04-01T00:00:00Z" };
    playCounts["other-1"] = { count: 1, lastPlayedAt: "2026-04-01T00:00:00Z" };
    playCounts["other-2"] = { count: 1, lastPlayedAt: "2026-04-01T00:00:00Z" };
    await writeJsonAtomic(path.join(dir, "play-counts.json"), { tracks: playCounts });

    const result = await generateForYouPlaylists("user-1", indexStore);
    const pinkFloyd = result.find((p) => p.seedArtist === "Pink Floyd");
    expect(pinkFloyd).toBeDefined();

    const artistCounts = new Map<string, number>();
    for (const id of pinkFloyd!.trackIds) {
      const t = tracks.find((tr) => tr.id === id)!;
      const a = t.tags.artist!;
      artistCounts.set(a, (artistCounts.get(a) ?? 0) + 1);
    }
    const dominantCount = artistCounts.get("Dominant Band") ?? 0;
    expect(dominantCount).toBeLessThanOrEqual(4);
  });

  it("includes genreless tracks via year fallback", async () => {
    const { generateForYouPlaylists } = await import("./forYouPlaylistService");
    const { ensureDir, writeJsonAtomic } = await import("../../utils/fs");

    // Seed: Pink Floyd (Rock, 1973). A peer artist with no genre but the same era.
    const tracks: Track[] = [];
    for (let i = 0; i < 10; i++) {
      tracks.push(makeTrack({ id: `seed-${i}`, tags: { artist: "Pink Floyd", album: `pf-${i}`, genre: ["Rock"], year: 1973 } }));
    }
    for (let i = 0; i < 8; i++) {
      tracks.push(makeTrack({ id: `genreless-${i}`, tags: { artist: "Mystery Band", album: `m-${i}`, year: 1974 } }));
    }
    // Two extra non-overlapping artists so we hit MIN_DISTINCT_ARTISTS via plays.
    for (let i = 0; i < 4; i++) {
      tracks.push(makeTrack({ id: `other-${i}`, tags: { artist: "Other Band", album: `ob-${i}`, genre: ["Rock"], year: 1974 } }));
    }
    for (let i = 0; i < 4; i++) {
      tracks.push(makeTrack({ id: `third-${i}`, tags: { artist: "Third Band", album: `tb-${i}`, genre: ["Rock"], year: 1974 } }));
    }

    const indexStore = makeMockIndexStore(tracks);
    const dir = path.join(tmpDir, "data", "storage", "users", "user-1");
    await ensureDir(dir);
    const playCounts: Record<string, { count: number; lastPlayedAt: string }> = {};
    for (let i = 0; i < 10; i++) playCounts[`seed-${i}`] = { count: 3, lastPlayedAt: "2026-04-01T00:00:00Z" };
    playCounts["other-0"] = { count: 2, lastPlayedAt: "2026-04-01T00:00:00Z" };
    playCounts["other-1"] = { count: 2, lastPlayedAt: "2026-04-01T00:00:00Z" };
    playCounts["third-0"] = { count: 1, lastPlayedAt: "2026-04-01T00:00:00Z" };
    await writeJsonAtomic(path.join(dir, "play-counts.json"), { tracks: playCounts });

    const result = await generateForYouPlaylists("user-1", indexStore);
    const pinkFloyd = result.find((p) => p.seedArtist === "Pink Floyd");
    expect(pinkFloyd).toBeDefined();
    const hasMystery = pinkFloyd!.trackIds.some((id) => id.startsWith("genreless-"));
    expect(hasMystery).toBe(true);
  });

  it("trace records final-order with feature breakdowns", async () => {
    const { regenerateForYouPlaylists, loadForYouTrace } = await import("./forYouPlaylistService");
    const { ensureDir, writeJsonAtomic } = await import("../../utils/fs");

    const artists = ["Pink Floyd", "Led Zeppelin", "Deep Purple", "Black Sabbath"];
    const tracks: Track[] = [];
    for (let i = 0; i < 60; i++) {
      const artist = artists[i % 4]!;
      tracks.push(makeTrack({ id: `track-${i}`, tags: { artist, album: `${artist}-${i % 3}`, genre: ["Rock"], year: 1972 + (i % 6) } }));
    }
    const indexStore = makeMockIndexStore(tracks);
    const dir = path.join(tmpDir, "data", "storage", "users", "user-1");
    await ensureDir(dir);
    const playCounts: Record<string, { count: number; lastPlayedAt: string }> = {};
    for (let i = 0; i < 30; i++) playCounts[`track-${i}`] = { count: 2, lastPlayedAt: "2026-04-01T00:00:00Z" };
    await writeJsonAtomic(path.join(dir, "play-counts.json"), { tracks: playCounts });

    await regenerateForYouPlaylists("user-1", indexStore);
    const trace = await loadForYouTrace("user-1");

    expect(trace).not.toBeNull();
    const successful = trace!.playlists.find((p) => p.playlistId !== null);
    expect(successful).toBeDefined();
    expect(successful!.finalOrder).toBeDefined();
    expect(successful!.finalOrder!.length).toBeGreaterThan(0);
    const sample = successful!.finalOrder![0]!;
    expect(sample.features.genreOverlap).toBeGreaterThanOrEqual(0);
    expect(sample.features.genreOverlap).toBeLessThanOrEqual(1);
    expect(sample.features.yearProximity).toBeGreaterThanOrEqual(0);
    expect(sample.features.yearProximity).toBeLessThanOrEqual(1);
  });

  it("uses embedding similarity in the trace, with a neutral score when no embeddings exist", async () => {
    const { regenerateForYouPlaylists, loadForYouTrace } = await import("./forYouPlaylistService");
    const { ensureDir, writeJsonAtomic } = await import("../../utils/fs");

    const artists = ["Pink Floyd", "Led Zeppelin", "Deep Purple", "Black Sabbath"];
    const tracks: Track[] = [];
    for (let i = 0; i < 60; i++) {
      const artist = artists[i % 4]!;
      tracks.push(
        makeTrack({
          id: `track-${i}`,
          tags: { artist, album: `${artist}-${i % 3}`, genre: ["Rock"], year: 1972 + (i % 6) }
        })
      );
    }
    const indexStore = makeMockIndexStore(tracks);

    const dir = path.join(tmpDir, "data", "storage", "users", "user-1");
    await ensureDir(dir);
    const playCounts: Record<string, { count: number; lastPlayedAt: string }> = {};
    for (let i = 0; i < 30; i++) playCounts[`track-${i}`] = { count: 2, lastPlayedAt: "2026-04-01T00:00:00Z" };
    await writeJsonAtomic(path.join(dir, "play-counts.json"), { tracks: playCounts });

    await regenerateForYouPlaylists("user-1", indexStore);
    const trace = await loadForYouTrace("user-1");
    expect(trace).not.toBeNull();
    const playlist = trace!.playlists.find((p) => p.finalOrder && p.finalOrder.length > 0);
    expect(playlist).toBeDefined();
    for (const entry of playlist!.finalOrder!) {
      // No embeddings exist on disk, so non-seed candidates must get the
      // neutral 0.5 score; seeds get 1.0 since they're the seed set.
      expect([0.5, 1]).toContain(entry.features.embeddingSimilarity);
    }
  });

  it("excludes tracks with 3+ recent skips from the candidate pool", async () => {
    const { regenerateForYouPlaylists, loadForYouTrace } = await import("./forYouPlaylistService");
    const { ensureDir, writeJsonAtomic } = await import("../../utils/fs");

    const artists = ["Pink Floyd", "Led Zeppelin", "Deep Purple", "Black Sabbath"];
    const tracks: Track[] = [];
    for (let i = 0; i < 60; i++) {
      const artist = artists[i % 4]!;
      tracks.push(
        makeTrack({
          id: `track-${i}`,
          tags: { artist, album: `${artist}-${i % 3}`, genre: ["Rock"], year: 1972 + (i % 6) }
        })
      );
    }
    const indexStore = makeMockIndexStore(tracks);

    const dir = path.join(tmpDir, "data", "storage", "users", "user-1");
    await ensureDir(dir);
    const playCounts: Record<string, { count: number; lastPlayedAt: string }> = {};
    for (let i = 0; i < 30; i++) playCounts[`track-${i}`] = { count: 2, lastPlayedAt: "2026-04-01T00:00:00Z" };
    await writeJsonAtomic(path.join(dir, "play-counts.json"), { tracks: playCounts });

    // Mark a handful of peer-pool tracks as heavily skipped.
    const recent = new Date().toISOString();
    const skips: Record<string, { count: number; lastSkippedAt: string }> = {
      "track-30": { count: 5, lastSkippedAt: recent },
      "track-31": { count: 3, lastSkippedAt: recent },
      "track-32": { count: 4, lastSkippedAt: recent }
    };
    await writeJsonAtomic(path.join(dir, "skips.json"), { tracks: skips });

    await regenerateForYouPlaylists("user-1", indexStore);

    const trace = await loadForYouTrace("user-1");
    expect(trace).not.toBeNull();
    for (const playlist of trace!.playlists) {
      expect(playlist.finalTrackIds).not.toContain("track-30");
      expect(playlist.finalTrackIds).not.toContain("track-31");
      expect(playlist.finalTrackIds).not.toContain("track-32");
    }
  });

  it("dismissed seed is skipped at the seed-selection stage", async () => {
    const { regenerateForYouPlaylists, dismissForYouPlaylist, loadForYouTrace } =
      await import("./forYouPlaylistService");
    const { ensureDir, writeJsonAtomic } = await import("../../utils/fs");

    const artists = ["Pink Floyd", "Led Zeppelin", "Deep Purple", "Black Sabbath"];
    const tracks: Track[] = [];
    for (let i = 0; i < 60; i++) {
      const artist = artists[i % 4]!;
      tracks.push(makeTrack({ id: `track-${i}`, tags: { artist, album: `${artist}-${i % 3}`, genre: ["Rock"], year: 1972 + (i % 6) } }));
    }
    const indexStore = makeMockIndexStore(tracks);
    const dir = path.join(tmpDir, "data", "storage", "users", "user-1");
    await ensureDir(dir);
    const playCounts: Record<string, { count: number; lastPlayedAt: string }> = {};
    for (let i = 0; i < 30; i++) playCounts[`track-${i}`] = { count: 2, lastPlayedAt: "2026-04-01T00:00:00Z" };
    await writeJsonAtomic(path.join(dir, "play-counts.json"), { tracks: playCounts });

    await dismissForYouPlaylist("user-1", "for-you:pink-floyd");
    await regenerateForYouPlaylists("user-1", indexStore);

    const trace = await loadForYouTrace("user-1");
    expect(trace).not.toBeNull();
    const skipped = trace!.seedSelection.skipped.find((s) => s.artist === "Pink Floyd");
    expect(skipped?.reason).toBe("dismissed");
    const chosenIncludesPF = trace!.seedSelection.chosen.includes("Pink Floyd");
    expect(chosenIncludesPF).toBe(false);
  });
});
