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
    tmpDir: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "auto-playlist-test-"))
  };
});

vi.mock("../../utils/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths")>()),
  dataRoot: tmpDir
}));

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
import {
  generateAutoPlaylists,
  generateAutoPlaylistsWithTrace,
  getAutoPlaylistById,
  getAutoPlaylistConfig,
  loadAutoPlaylists,
  loadAutoTrace,
  needsRegeneration,
  regenerateAutoPlaylists,
  saveAutoPlaylists,
  updateAutoPlaylistConfig
} from "./autoPlaylistService";

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

function tracksForGroup(genre: string, year: number, count: number, prefix: string): Track[] {
  return Array.from({ length: count }, (_, i) =>
    makeTrack({
      id: `${prefix}-${i}`,
      tags: {
        title: `${prefix}-${i}`,
        artist: `artist-${i}`,
        album: `album-${i}`,
        genre: [genre],
        year
      }
    })
  );
}

beforeEach(async () => {
  for (const entry of await fs.readdir(tmpDir).catch(() => [])) {
    await fs.rm(path.join(tmpDir, entry), { recursive: true, force: true });
  }
  await fs.mkdir(path.join(tmpDir, "config"), { recursive: true });
  await fs.mkdir(path.join(tmpDir, "auto-playlists"), { recursive: true });
});

afterAll(() => {
  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

describe("autoPlaylistService", () => {
  describe("config", () => {
    it("returns defaults when no config file exists", async () => {
      expect(await getAutoPlaylistConfig()).toEqual({
        maxPlaylists: 0,
        minTracksPerPlaylist: 8,
        tracksPerPlaylist: 30
      });
    });

    it("persists partial updates and rejects out-of-range values", async () => {
      await updateAutoPlaylistConfig({ minTracksPerPlaylist: 5, tracksPerPlaylist: 0 });
      const config = await getAutoPlaylistConfig();
      expect(config.minTracksPerPlaylist).toBe(5);
      expect(config.tracksPerPlaylist).toBe(30);
    });
  });

  describe("generateAutoPlaylists", () => {
    it("groups tracks by genre and decade, skipping groups below the minimum", async () => {
      await updateAutoPlaylistConfig({ minTracksPerPlaylist: 8, tracksPerPlaylist: 20 });
      const tracks = [
        ...tracksForGroup("Rock", 1975, 10, "rock70s"),
        ...tracksForGroup("Jazz", 1965, 3, "jazz60s")
      ];
      const playlists = await generateAutoPlaylists(tracks);
      expect(playlists).toHaveLength(1);
      expect(playlists[0]?.name).toBe("70s Rock");
      expect(playlists[0]?.decade).toBe(1970);
      expect(playlists[0]?.id).toBe("auto:70s-rock");
    });

    it("ignores tracks missing genre or year", async () => {
      await updateAutoPlaylistConfig({ minTracksPerPlaylist: 4, tracksPerPlaylist: 10 });
      const tracks = [
        ...tracksForGroup("Rock", 1985, 4, "rock80s"),
        makeTrack({ id: "no-year", tags: { genre: ["Rock"] } }),
        makeTrack({ id: "no-genre", tags: { year: 1985 } })
      ];
      const playlists = await generateAutoPlaylists(tracks);
      expect(playlists).toHaveLength(1);
      expect(playlists[0]?.trackIds).toHaveLength(4);
      expect(playlists[0]?.trackIds).not.toContain("no-year");
      expect(playlists[0]?.trackIds).not.toContain("no-genre");
    });

    it("caps the number of playlists at maxPlaylists when positive", async () => {
      await updateAutoPlaylistConfig({
        maxPlaylists: 2,
        minTracksPerPlaylist: 3,
        tracksPerPlaylist: 10
      });
      const tracks = [
        ...tracksForGroup("Rock", 1975, 10, "r70"),
        ...tracksForGroup("Jazz", 1965, 8, "j60"),
        ...tracksForGroup("Funk", 1985, 5, "f80")
      ];
      const playlists = await generateAutoPlaylists(tracks);
      expect(playlists).toHaveLength(2);
    });

    it("caps each playlist at tracksPerPlaylist", async () => {
      await updateAutoPlaylistConfig({ minTracksPerPlaylist: 5, tracksPerPlaylist: 5 });
      const tracks = tracksForGroup("Rock", 1975, 20, "r70");
      const playlists = await generateAutoPlaylists(tracks);
      expect(playlists[0]?.trackIds).toHaveLength(5);
    });
  });

  describe("storage round-trip", () => {
    it("persists playlists to disk and loads them back", async () => {
      await updateAutoPlaylistConfig({ minTracksPerPlaylist: 4, tracksPerPlaylist: 10 });
      const tracks = tracksForGroup("Rock", 1975, 8, "r70");
      const generated = await generateAutoPlaylists(tracks);
      await saveAutoPlaylists(generated);

      const loaded = await loadAutoPlaylists();
      expect(loaded.map((p) => p.id).sort()).toEqual(generated.map((p) => p.id).sort());

      const single = await getAutoPlaylistById(generated[0]!.id);
      expect(single?.name).toBe(generated[0]!.name);
    });

    it("replaces existing playlists on subsequent saves", async () => {
      await updateAutoPlaylistConfig({ minTracksPerPlaylist: 4, tracksPerPlaylist: 10 });
      const first = await generateAutoPlaylists(tracksForGroup("Rock", 1975, 8, "r"));
      await saveAutoPlaylists(first);
      const second = await generateAutoPlaylists(tracksForGroup("Jazz", 1965, 8, "j"));
      await saveAutoPlaylists(second);

      const loaded = await loadAutoPlaylists();
      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.genre).toBe("Jazz");
    });
  });

  describe("trace", () => {
    it("returns trace data alongside playlists, including rejected groups", async () => {
      await updateAutoPlaylistConfig({ minTracksPerPlaylist: 8, tracksPerPlaylist: 20 });
      const tracks = [
        ...tracksForGroup("Rock", 1975, 10, "rock70s"),
        ...tracksForGroup("Jazz", 1965, 3, "jazz60s")
      ];
      const { playlists, trace } = await generateAutoPlaylistsWithTrace(tracks);
      expect(playlists).toHaveLength(1);
      expect(trace.totalCandidateTracks).toBe(13);
      expect(trace.totalGroups).toBe(2);
      expect(trace.qualifyingGroups).toBe(1);
      expect(trace.generatedPlaylists).toBe(1);
      const jazz = trace.groups.find((g) => g.genre === "Jazz");
      expect(jazz).toBeDefined();
      expect(jazz!.selected).toBe(false);
      expect(jazz!.rejection).toBe("below-min-tracks");
    });

    it("regenerateAutoPlaylists persists a loadable trace", async () => {
      await updateAutoPlaylistConfig({ minTracksPerPlaylist: 4, tracksPerPlaylist: 10 });
      const tracks = tracksForGroup("Rock", 1975, 6, "r");
      await regenerateAutoPlaylists(tracks);
      const trace = await loadAutoTrace();
      expect(trace).not.toBeNull();
      expect(trace!.generatedPlaylists).toBe(1);
      expect(trace!.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("needsRegeneration", () => {
    it("returns true when no meta file exists", async () => {
      expect(await needsRegeneration()).toBe(true);
    });

    it("returns false immediately after a save", async () => {
      await saveAutoPlaylists([]);
      expect(await needsRegeneration()).toBe(false);
    });
  });
});
