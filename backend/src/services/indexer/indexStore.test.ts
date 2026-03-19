import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryIndex, Playlist, Track } from "../../types/library";

const {
  mockReadJsonFile,
  mockWriteJsonAtomic,
  mockPruneTrackMetadataOverrides,
  mockScanFilesystemLibrary,
  mockScanFilesystemPlaylists
} = vi.hoisted(() => ({
  mockReadJsonFile: vi.fn(),
  mockWriteJsonAtomic: vi.fn(),
  mockPruneTrackMetadataOverrides: vi.fn(),
  mockScanFilesystemLibrary: vi.fn(),
  mockScanFilesystemPlaylists: vi.fn()
}));

vi.mock("../../utils/fs", () => ({
  readJsonFile: mockReadJsonFile,
  writeJsonAtomic: mockWriteJsonAtomic
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

function createTrack(
  id: string,
  owner: string,
  artist: string,
  album: string
): Track {
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
    mockReadJsonFile.mockReset();
    mockWriteJsonAtomic.mockReset();
    mockPruneTrackMetadataOverrides.mockReset();
    mockScanFilesystemLibrary.mockReset();
    mockScanFilesystemPlaylists.mockReset();
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
    const refreshedPlaylists: Playlist[] = [
      {
        id: "owner-1:favorites",
        name: "Favorites",
        authorId: "owner-1",
        visibility: "private",
        trackIds: ["track-a"]
      }
    ];

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
});
