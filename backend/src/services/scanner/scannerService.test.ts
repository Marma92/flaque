import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryIndex } from "../../types/library";

const {
  mockReadTrackMetadataOverrides,
  mockExtractAudioMetadata,
  mockEnsureTrackCover,
  mockScanFilesystemPlaylists,
  mockEnsureDirectoryMetadata,
  mockFetchAlbumCoverPath,
  mockFetchArtistPhotoPath,
  mockWriteEmbeddedCoverToDirectory
} = vi.hoisted(() => ({
  mockReadTrackMetadataOverrides: vi.fn(),
  mockExtractAudioMetadata: vi.fn(),
  mockEnsureTrackCover: vi.fn(),
  mockScanFilesystemPlaylists: vi.fn(),
  mockEnsureDirectoryMetadata: vi.fn(),
  mockFetchAlbumCoverPath: vi.fn(),
  mockFetchArtistPhotoPath: vi.fn(),
  mockWriteEmbeddedCoverToDirectory: vi.fn()
}));

vi.mock("../indexer/metadataOverrideStore", () => ({
  readTrackMetadataOverrides: mockReadTrackMetadataOverrides
}));

vi.mock("./audioProbe", () => ({
  extractAudioMetadata: mockExtractAudioMetadata
}));

vi.mock("../storage/coverService", () => ({
  ensureTrackCover: mockEnsureTrackCover
}));

vi.mock("../playlists/playlistStore", () => ({
  scanFilesystemPlaylists: mockScanFilesystemPlaylists
}));

vi.mock("../media/mediaMetadataService", () => ({
  ensureDirectoryMetadata: mockEnsureDirectoryMetadata,
  fetchAlbumCoverPath: mockFetchAlbumCoverPath,
  fetchArtistPhotoPath: mockFetchArtistPhotoPath,
  normalizeDirectorySegment: (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
  writeEmbeddedCoverToDirectory: mockWriteEmbeddedCoverToDirectory
}));

let dataRoot = "";

function getOwnerUploadsRoot(ownerId: string): string {
  return path.join(dataRoot, "storage", "users", ownerId, "uploads");
}

async function writeAudioFile(ownerId: string, relativePath: string, content: string): Promise<string> {
  const absolutePath = path.join(getOwnerUploadsRoot(ownerId), relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
  return absolutePath;
}

function normalizeSnapshot(snapshot: LibraryIndex) {
  return {
    totalTracks: snapshot.totalTracks,
    tracks: snapshot.tracks,
    playlists: snapshot.playlists ?? []
  };
}

beforeEach(async () => {
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "flaque-scanner-service-"));
  process.env.DATA_ROOT = dataRoot;

  mockReadTrackMetadataOverrides.mockReset();
  mockExtractAudioMetadata.mockReset();
  mockEnsureTrackCover.mockReset();
  mockScanFilesystemPlaylists.mockReset();
  mockEnsureDirectoryMetadata.mockReset();
  mockFetchAlbumCoverPath.mockReset();
  mockFetchArtistPhotoPath.mockReset();
  mockWriteEmbeddedCoverToDirectory.mockReset();

  mockReadTrackMetadataOverrides.mockResolvedValue({});
  mockEnsureTrackCover.mockResolvedValue(undefined);
  mockScanFilesystemPlaylists.mockResolvedValue([]);
  mockEnsureDirectoryMetadata.mockResolvedValue(undefined);
  mockFetchAlbumCoverPath.mockResolvedValue(undefined);
  mockFetchArtistPhotoPath.mockResolvedValue(undefined);
  mockWriteEmbeddedCoverToDirectory.mockResolvedValue(undefined);

  mockExtractAudioMetadata.mockImplementation(async (filePath: string) => {
    const stats = await fs.stat(filePath);
    const title = path.basename(filePath, path.extname(filePath));
    const album = path.basename(path.dirname(filePath));
    const artist = path.basename(path.dirname(path.dirname(filePath)));

    return {
      duration: stats.size,
      codec: "mock-codec",
      bitrate: 192000,
      sampleRate: 44100,
      tags: {
        title,
        artist,
        album
      }
    };
  });
});

afterEach(async () => {
  await fs.rm(dataRoot, { recursive: true, force: true });
  delete process.env.DATA_ROOT;
  delete process.env.SCANNER_REBUILD_MODE;
  vi.resetModules();
});

describe("scanFilesystemLibrary incremental mode", () => {
  it("probes only newly added files", async () => {
    const ownerId = "owner-1";
    await writeAudioFile(ownerId, "artist_a/album_a/track-a.mp3", "aaa");

    const { scanFilesystemLibrary } = await import("./scannerService");
    const first = await scanFilesystemLibrary({ mode: "full" });

    mockExtractAudioMetadata.mockClear();
    await writeAudioFile(ownerId, "artist_a/album_a/track-b.mp3", "bbbb");

    const incremental = await scanFilesystemLibrary({ previousIndex: first });

    expect(mockExtractAudioMetadata).toHaveBeenCalledTimes(1);
    expect(mockExtractAudioMetadata).toHaveBeenCalledWith(
      expect.stringContaining(path.join("artist_a", "album_a", "track-b.mp3"))
    );
    expect(incremental.totalTracks).toBe(2);
    expect(incremental.tracks.map((track) => track.tags.title)).toEqual(["track-a", "track-b"]);
  });

  it("re-probes modified files and matches full rebuild truth", async () => {
    const ownerId = "owner-1";
    const trackPath = await writeAudioFile(ownerId, "artist_a/album_a/track-a.mp3", "aaa");

    const { scanFilesystemLibrary } = await import("./scannerService");
    const first = await scanFilesystemLibrary({ mode: "full" });

    mockExtractAudioMetadata.mockClear();
    await fs.writeFile(trackPath, "aaaaaa", "utf8");

    const incremental = await scanFilesystemLibrary({ previousIndex: first });
    expect(mockExtractAudioMetadata).toHaveBeenCalledTimes(1);
    expect(incremental.tracks[0]?.duration).toBe(6);

    mockExtractAudioMetadata.mockClear();
    const full = await scanFilesystemLibrary({ mode: "full" });
    expect(mockExtractAudioMetadata).toHaveBeenCalledTimes(1);
    expect(normalizeSnapshot(incremental)).toEqual(normalizeSnapshot(full));
  });

  it("removes deleted files from index", async () => {
    const ownerId = "owner-1";
    const trackA = await writeAudioFile(ownerId, "artist_a/album_a/track-a.mp3", "aaa");
    await writeAudioFile(ownerId, "artist_a/album_a/track-b.mp3", "bbbb");

    const { scanFilesystemLibrary } = await import("./scannerService");
    const first = await scanFilesystemLibrary({ mode: "full" });

    mockExtractAudioMetadata.mockClear();
    await fs.unlink(trackA);

    const incremental = await scanFilesystemLibrary({ previousIndex: first });

    expect(mockExtractAudioMetadata).toHaveBeenCalledTimes(0);
    expect(incremental.totalTracks).toBe(1);
    expect(incremental.tracks.map((track) => track.tags.title)).toEqual(["track-b"]);
  });

  it("does zero probe when filesystem is unchanged", async () => {
    const ownerId = "owner-1";
    await writeAudioFile(ownerId, "artist_b/album_b/z-track.mp3", "zzzz");
    await writeAudioFile(ownerId, "artist_a/album_a/a-track.mp3", "aa");

    const { scanFilesystemLibrary } = await import("./scannerService");
    const first = await scanFilesystemLibrary({ mode: "full" });
    expect(first.totalTracks).toBe(2);

    mockExtractAudioMetadata.mockClear();
    const second = await scanFilesystemLibrary({ previousIndex: first });

    expect(mockExtractAudioMetadata).toHaveBeenCalledTimes(0);
    expect(second.totalTracks).toBe(2);
    expect(second.tracks.map((track) => track.tags.title)).toEqual(["a-track", "z-track"]);
  });
});
