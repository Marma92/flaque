import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryIndex, Playlist, Track } from "../../types/library";

const {
  mockFileExists,
  mockReadJsonFile,
  mockWriteJsonAtomic,
  mockPruneTrackMetadataOverrides,
  mockScanFilesystemLibrary,
  mockScanFilesystemPlaylists
} = vi.hoisted(() => ({
  mockFileExists: vi.fn(),
  mockReadJsonFile: vi.fn(),
  mockWriteJsonAtomic: vi.fn(),
  mockPruneTrackMetadataOverrides: vi.fn(),
  mockScanFilesystemLibrary: vi.fn(),
  mockScanFilesystemPlaylists: vi.fn()
}));

vi.mock("../../utils/fs", () => ({
  fileExists: mockFileExists,
  readJsonFile: mockReadJsonFile,
  writeJsonAtomic: mockWriteJsonAtomic
}));

vi.mock("../../utils/paths", () => ({
  indexFilePath: "/data/index/library-index.json",
  playlistsIndexFilePath: "/data/index/playlists-index.json"
}));

vi.mock("./metadataOverrideStore", () => ({
  pruneTrackMetadataOverrides: mockPruneTrackMetadataOverrides
}));

vi.mock("../scanner/scannerService", () => ({
  scanFilesystemLibrary: mockScanFilesystemLibrary
}));

vi.mock("../playlists/playlistStore", () => ({
  scanFilesystemPlaylists: mockScanFilesystemPlaylists
}));

import { IndexStore } from "./indexStore";

function createTrack(id: string, owner: string, artist: string, album: string): Track {
  return {
    id,
    owner,
    path: `storage/users/${owner}/uploads/${id}.mp3`,
    duration: 120,
    mimeType: "audio/mpeg",
    codec: "mp3",
    tags: {
      title: id,
      artist,
      album
    }
  };
}

function createPlaylist(id: string, trackIds: string[]): Playlist {
  return {
    id,
    name: id,
    authorId: "owner-1",
    visibility: "private",
    trackIds
  };
}

function createSnapshot(tracks: Track[], playlists: Playlist[] = []): LibraryIndex {
  return {
    generatedAt: new Date().toISOString(),
    totalTracks: tracks.length,
    tracks,
    playlists
  };
}

describe("IndexStore", () => {
  beforeEach(() => {
    mockFileExists.mockReset();
    mockReadJsonFile.mockReset();
    mockWriteJsonAtomic.mockReset();
    mockPruneTrackMetadataOverrides.mockReset();
    mockScanFilesystemLibrary.mockReset();
    mockScanFilesystemPlaylists.mockReset();
    mockFileExists.mockResolvedValue(false);
  });

  it("builds in-memory indexes from loaded snapshot", async () => {
    const trackA = createTrack("track-a", "owner-1", "Artist One", "Album One");
    const trackB = createTrack("track-b", "owner-2", "Artist One", "Album Two");
    const snapshot = createSnapshot([trackA, trackB]);
    mockReadJsonFile.mockResolvedValue(snapshot);

    const store = new IndexStore();
    await store.initialize();

    expect(store.getSnapshot()).toEqual(snapshot);
    expect(store.getTrackById("track-a")).toEqual(trackA);
    expect(store.hasTrack("track-b")).toBe(true);
    expect(store.getTracksByOwner("OWNER-1")).toEqual([trackA]);
    expect(store.getTracksByArtist("artist one")).toEqual([trackA, trackB]);
    expect(store.getTracksByAlbum(" album two ")).toEqual([trackB]);
  });

  it("keeps indexes coherent after rebuild", async () => {
    const initialTrack = createTrack("initial", "owner-1", "Artist One", "Album One");
    const rebuiltTrack = createTrack("rebuilt", "owner-2", "Artist Two", "Album Two");

    mockReadJsonFile.mockResolvedValue(createSnapshot([initialTrack]));
    mockScanFilesystemLibrary.mockResolvedValue(createSnapshot([rebuiltTrack]));

    const store = new IndexStore();
    await store.initialize();
    const rebuilt = await store.rebuild();

    expect(rebuilt.tracks).toEqual([rebuiltTrack]);
    expect(store.getTrackById("initial")).toBeUndefined();
    expect(store.getTrackById("rebuilt")).toEqual(rebuiltTrack);
    expect(store.getTracksByOwner("owner-1")).toEqual([]);
    expect(store.getTracksByOwner("owner-2")).toEqual([rebuiltTrack]);
    expect(mockPruneTrackMetadataOverrides).toHaveBeenCalledWith(["rebuilt"]);
  });

  it("keeps track indexes coherent when refreshing playlists", async () => {
    const trackA = createTrack("track-a", "owner-1", "Artist One", "Album One");
    const trackB = createTrack("track-b", "owner-1", "Artist Two", "Album One");
    const baseSnapshot = createSnapshot([trackA, trackB], []);
    const refreshedPlaylists = [createPlaylist("owner-1:favorites", ["track-a"])];

    mockReadJsonFile.mockResolvedValue(baseSnapshot);
    mockScanFilesystemPlaylists.mockResolvedValue(refreshedPlaylists);

    const store = new IndexStore();
    await store.initialize();
    const refreshed = await store.refreshPlaylists();

    expect(mockScanFilesystemPlaylists).toHaveBeenCalledWith([trackA, trackB]);
    expect(refreshed.playlists).toEqual(refreshedPlaylists);
    expect(store.getTrackById("track-a")).toEqual(trackA);
    expect(store.getTracksByAlbum("album one")).toEqual([trackA, trackB]);
  });

  it("loads playlists from legacy library-index when playlists-index is missing", async () => {
    const tracks = [createTrack("track-a", "owner-1", "Artist", "Album")];
    const legacyPlaylists = [createPlaylist("legacy-playlist", ["track-a"])];
    mockFileExists.mockResolvedValue(false);
    mockReadJsonFile.mockImplementation(async (filePath: string, fallback: unknown) => {
      if (filePath === "/data/index/library-index.json") {
        return createSnapshot(tracks, legacyPlaylists);
      }
      return fallback;
    });

    const store = new IndexStore();
    await store.initialize();

    expect(store.getSnapshot().playlists).toEqual(legacyPlaylists);
  });

  it("refreshes playlists without rewriting library-index.json", async () => {
    const tracks = [createTrack("track-a", "owner-1", "Artist", "Album")];
    const expectedPlaylists = [createPlaylist("fresh-playlist", ["track-a"])];

    mockFileExists.mockResolvedValue(false);
    mockReadJsonFile.mockImplementation(async (filePath: string, fallback: unknown) => {
      if (filePath === "/data/index/library-index.json") {
        return {
          generatedAt: "2026-03-19T10:00:00.000Z",
          totalTracks: tracks.length,
          tracks
        };
      }
      return fallback;
    });
    mockScanFilesystemPlaylists.mockResolvedValue(expectedPlaylists);

    const store = new IndexStore();
    await store.initialize();
    await store.refreshPlaylists();

    expect(mockWriteJsonAtomic).toHaveBeenCalledTimes(1);
    expect(mockWriteJsonAtomic).toHaveBeenCalledWith("/data/index/playlists-index.json", {
      playlists: expectedPlaylists
    });
  });

  it("keeps runtime snapshot coherent across split index files", async () => {
    const tracks = [
      createTrack("track-a", "owner-1", "Artist", "Album"),
      createTrack("track-b", "owner-1", "Artist", "Album")
    ];
    const initialPlaylists = [createPlaylist("initial-playlist", ["track-a"])];
    const refreshedPlaylists = [createPlaylist("refreshed-playlist", ["track-a", "track-b"])];

    mockFileExists.mockResolvedValue(true);
    mockReadJsonFile.mockImplementation(async (filePath: string, fallback: unknown) => {
      if (filePath === "/data/index/library-index.json") {
        return {
          generatedAt: "2026-03-19T10:00:00.000Z",
          totalTracks: tracks.length,
          tracks
        };
      }

      if (filePath === "/data/index/playlists-index.json") {
        return { playlists: initialPlaylists };
      }

      return fallback;
    });
    mockScanFilesystemPlaylists.mockResolvedValue(refreshedPlaylists);

    const store = new IndexStore();
    await store.initialize();
    expect(store.getSnapshot().playlists).toEqual(initialPlaylists);

    const refreshed = await store.refreshPlaylists();

    expect(refreshed).toMatchObject({
      totalTracks: tracks.length,
      tracks,
      playlists: refreshedPlaylists
    });
    expect(store.getTrackById("track-a")).toEqual(tracks[0]);
    expect(store.getSnapshot()).toEqual(refreshed);
  });
});
