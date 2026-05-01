import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

vi.mock("../../utils/paths", async () => {
  return {
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
  for (const t of tracks) {
    const artist = (t.tags.artist ?? "Unknown").toLowerCase();
    const list = byArtist.get(artist) ?? [];
    list.push(t);
    byArtist.set(artist, list);
  }

  return {
    getSnapshot: () => ({ tracks, totalTracks: tracks.length, generatedAt: "", playlists: [] }),
    getTrackById: (id: string) => byId.get(id),
    getTracksByArtist: (artist: string) => byArtist.get(artist.toLowerCase()) ?? [],
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
    expect(result.length).toBeLessThanOrEqual(3);

    for (const playlist of result) {
      expect(playlist.id).toMatch(/^for-you:/);
      expect(playlist.name).toMatch(/^Because you listen to /);
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
});
