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

async function writePlayCounts(
  userId: string,
  counts: Record<string, { count: number; lastPlayedAt: string }>
): Promise<void> {
  const { ensureDir, writeJsonAtomic } = await import("../../utils/fs");
  const dir = path.join(tmpDir, "data", "storage", "users", userId);
  await ensureDir(dir);
  await writeJsonAtomic(path.join(dir, "play-counts.json"), { tracks: counts });
}

describe("personalPlaylistService", () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "personal-test-"));
    await fs.mkdir(path.join(tmpDir, "data", "config"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, "data", "storage", "users"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("skips generation when user is below thresholds", async () => {
    const { generatePersonalPlaylistsWithTrace } = await import("./personalPlaylistService");
    const tracks = Array.from({ length: 5 }, (_, i) =>
      makeTrack({ id: `t-${i}`, tags: { artist: `A${i}` } })
    );
    const indexStore = makeMockIndexStore(tracks);
    await writePlayCounts("user-1", {
      "t-0": { count: 1, lastPlayedAt: "2026-04-01T00:00:00Z" }
    });
    const { playlists } = await generatePersonalPlaylistsWithTrace("user-1", indexStore);
    expect(playlists).toEqual([]);
  });

  it("discovered-this-year filters by addedAt within the current year and requires plays", async () => {
    const { generatePersonalPlaylistsWithTrace } = await import("./personalPlaylistService");
    const thisYear = new Date().getFullYear();
    const tracks: Track[] = [];
    // 10 tracks added this year, played
    for (let i = 0; i < 10; i++) {
      tracks.push(makeTrack({
        id: `new-${i}`,
        addedAt: `${thisYear}-03-15T00:00:00Z`,
        tags: { artist: `Artist ${i % 4}`, album: `Album ${i % 4}`, year: thisYear }
      }));
    }
    // Old tracks added years ago, also played
    for (let i = 0; i < 5; i++) {
      tracks.push(makeTrack({
        id: `old-${i}`,
        addedAt: `${thisYear - 3}-05-01T00:00:00Z`,
        tags: { artist: `OldArtist ${i}`, album: `OldAlbum ${i}`, year: thisYear - 3 }
      }));
    }

    const indexStore = makeMockIndexStore(tracks);
    const counts: Record<string, { count: number; lastPlayedAt: string }> = {};
    for (let i = 0; i < 10; i++) counts[`new-${i}`] = { count: 2, lastPlayedAt: `${thisYear}-04-01T00:00:00Z` };
    for (let i = 0; i < 5; i++) counts[`old-${i}`] = { count: 2, lastPlayedAt: `${thisYear}-04-01T00:00:00Z` };
    await writePlayCounts("user-1", counts);

    const { playlists } = await generatePersonalPlaylistsWithTrace("user-1", indexStore);
    const discovered = playlists.find((p) => p.variant === "discovered-this-year");
    expect(discovered).toBeDefined();
    expect(discovered!.trackIds.length).toBeGreaterThanOrEqual(8);
    for (const id of discovered!.trackIds) {
      expect(id.startsWith("new-")).toBe(true);
    }
  });

  it("forgotten-favorites surfaces tracks not played in the recent window", async () => {
    const { generatePersonalPlaylistsWithTrace } = await import("./personalPlaylistService");
    const thisYear = new Date().getFullYear();
    const tracks: Track[] = [];
    for (let i = 0; i < 10; i++) {
      tracks.push(makeTrack({
        id: `forgot-${i}`,
        tags: { artist: `Artist ${i % 4}`, album: `Album ${i % 4}`, year: thisYear - 5 }
      }));
    }
    // Recently-played decoys that should NOT appear
    for (let i = 0; i < 5; i++) {
      tracks.push(makeTrack({
        id: `recent-${i}`,
        tags: { artist: `Recent ${i}`, album: `RecentAlbum ${i}`, year: thisYear }
      }));
    }
    const indexStore = makeMockIndexStore(tracks);

    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const newDate = new Date().toISOString();
    const counts: Record<string, { count: number; lastPlayedAt: string }> = {};
    for (let i = 0; i < 10; i++) counts[`forgot-${i}`] = { count: 5, lastPlayedAt: oldDate };
    for (let i = 0; i < 5; i++) counts[`recent-${i}`] = { count: 5, lastPlayedAt: newDate };
    await writePlayCounts("user-1", counts);

    const { playlists } = await generatePersonalPlaylistsWithTrace("user-1", indexStore);
    const forgotten = playlists.find((p) => p.variant === "forgotten-favorites");
    expect(forgotten).toBeDefined();
    for (const id of forgotten!.trackIds) {
      expect(id.startsWith("forgot-")).toBe(true);
    }
  });

  it("album-deep-cuts surfaces unplayed tracks from engaged albums", async () => {
    const { generatePersonalPlaylistsWithTrace } = await import("./personalPlaylistService");
    const tracks: Track[] = [];
    // Album X has 10 tracks; user played 4, leaving 6 unplayed deep cuts.
    for (let i = 0; i < 10; i++) {
      tracks.push(makeTrack({
        id: `xa-${i}`,
        tags: { artist: "Big Star", album: "Album X", albumArtist: "Big Star", year: 1972 }
      }));
    }
    // Album Y has 10 tracks; user played 3, leaving 7 deep cuts.
    for (let i = 0; i < 10; i++) {
      tracks.push(makeTrack({
        id: `yb-${i}`,
        tags: { artist: "Big Star", album: "Album Y", albumArtist: "Big Star", year: 1973 }
      }));
    }
    // Filler so distinct artists threshold is met.
    for (let i = 0; i < 4; i++) {
      tracks.push(makeTrack({
        id: `fill-${i}`,
        tags: { artist: `Filler ${i}`, album: `Filler-album-${i}`, year: 1980 }
      }));
    }
    const indexStore = makeMockIndexStore(tracks);

    const at = "2026-04-01T00:00:00Z";
    const counts: Record<string, { count: number; lastPlayedAt: string }> = {};
    counts["xa-0"] = { count: 3, lastPlayedAt: at };
    counts["xa-1"] = { count: 3, lastPlayedAt: at };
    counts["xa-2"] = { count: 2, lastPlayedAt: at };
    counts["xa-3"] = { count: 2, lastPlayedAt: at };
    counts["yb-0"] = { count: 4, lastPlayedAt: at };
    counts["yb-1"] = { count: 2, lastPlayedAt: at };
    counts["yb-2"] = { count: 2, lastPlayedAt: at };
    counts["fill-0"] = { count: 1, lastPlayedAt: at };
    counts["fill-1"] = { count: 1, lastPlayedAt: at };
    counts["fill-2"] = { count: 1, lastPlayedAt: at };
    await writePlayCounts("user-1", counts);

    const { playlists } = await generatePersonalPlaylistsWithTrace("user-1", indexStore);
    const deep = playlists.find((p) => p.variant === "album-deep-cuts");
    expect(deep).toBeDefined();
    // Should be exactly the unplayed tracks from Album X and Album Y.
    const playedIds = new Set(Object.keys(counts));
    for (const id of deep!.trackIds) {
      expect(playedIds.has(id)).toBe(false);
      expect(id.startsWith("xa-") || id.startsWith("yb-")).toBe(true);
    }
  });

  it("hard-filters tracks with 3+ recent skips out of personal mixes", async () => {
    const { generatePersonalPlaylistsWithTrace } = await import("./personalPlaylistService");
    const { ensureDir, writeJsonAtomic } = await import("../../utils/fs");
    const thisYear = new Date().getFullYear();
    const tracks: Track[] = [];
    for (let i = 0; i < 12; i++) {
      tracks.push(makeTrack({
        id: `new-${i}`,
        addedAt: `${thisYear}-02-01T00:00:00Z`,
        tags: { artist: `Artist ${i % 4}`, album: `Album ${i % 4}`, year: thisYear }
      }));
    }
    const indexStore = makeMockIndexStore(tracks);
    const counts: Record<string, { count: number; lastPlayedAt: string }> = {};
    for (let i = 0; i < 12; i++) counts[`new-${i}`] = { count: 2, lastPlayedAt: `${thisYear}-04-01T00:00:00Z` };
    await writePlayCounts("user-1", counts);

    const recent = new Date().toISOString();
    const dir = path.join(tmpDir, "data", "storage", "users", "user-1");
    await ensureDir(dir);
    await writeJsonAtomic(path.join(dir, "skips.json"), {
      tracks: {
        "new-0": { count: 4, lastSkippedAt: recent },
        "new-1": { count: 3, lastSkippedAt: recent }
      }
    });

    const { playlists } = await generatePersonalPlaylistsWithTrace("user-1", indexStore);
    const discovered = playlists.find((p) => p.variant === "discovered-this-year");
    expect(discovered).toBeDefined();
    expect(discovered!.trackIds).not.toContain("new-0");
    expect(discovered!.trackIds).not.toContain("new-1");
  });

  it("regeneratePersonalPlaylists persists playlists, meta, and trace", async () => {
    const { regeneratePersonalPlaylists, loadPersonalPlaylists, loadPersonalTrace } =
      await import("./personalPlaylistService");
    const thisYear = new Date().getFullYear();
    const tracks: Track[] = [];
    for (let i = 0; i < 12; i++) {
      tracks.push(makeTrack({
        id: `t-${i}`,
        addedAt: `${thisYear}-02-01T00:00:00Z`,
        tags: { artist: `Artist ${i % 4}`, album: `Album ${i % 4}`, year: thisYear }
      }));
    }
    const indexStore = makeMockIndexStore(tracks);
    const counts: Record<string, { count: number; lastPlayedAt: string }> = {};
    for (let i = 0; i < 12; i++) counts[`t-${i}`] = { count: 2, lastPlayedAt: `${thisYear}-04-01T00:00:00Z` };
    await writePlayCounts("user-1", counts);

    await regeneratePersonalPlaylists("user-1", indexStore);
    const loaded = await loadPersonalPlaylists("user-1");
    expect(loaded.length).toBeGreaterThan(0);
    const trace = await loadPersonalTrace("user-1");
    expect(trace).not.toBeNull();
    expect(trace!.userId).toBe("user-1");
    expect(trace!.variants.length).toBe(3);
  });
});
