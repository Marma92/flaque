import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryIndex } from "../../types/library";
import { ALBUM_METADATA_FILE } from "../../utils/music";

const {
  mockReadTrackMetadataOverrides,
  mockExtractAudioMetadata,
  mockEnsureTrackCover,
  mockScanFilesystemPlaylists,
  mockEnsureDirectoryMetadata,
  mockFetchAlbumCoverPath,
  mockFetchArtistPhotoPath,
  mockWriteEmbeddedCoverToDirectory,
  mockReadTrackOwnership,
  mockWriteTrackOwnership
} = vi.hoisted(() => ({
  mockReadTrackMetadataOverrides: vi.fn(),
  mockExtractAudioMetadata: vi.fn(),
  mockEnsureTrackCover: vi.fn(),
  mockScanFilesystemPlaylists: vi.fn(),
  mockEnsureDirectoryMetadata: vi.fn(),
  mockFetchAlbumCoverPath: vi.fn(),
  mockFetchArtistPhotoPath: vi.fn(),
  mockWriteEmbeddedCoverToDirectory: vi.fn(),
  mockReadTrackOwnership: vi.fn(),
  mockWriteTrackOwnership: vi.fn()
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

vi.mock("../storage/ownershipStore", () => ({
  readTrackOwnership: mockReadTrackOwnership,
  writeTrackOwnership: mockWriteTrackOwnership
}));

let dataRoot = "";

function getSharedMusicRoot(): string {
  return path.join(dataRoot, "storage", "music");
}

async function writeAudioFile(relativePath: string, content: string): Promise<string> {
  const absolutePath = path.join(getSharedMusicRoot(), relativePath);
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
  mockReadTrackOwnership.mockReset();
  mockWriteTrackOwnership.mockReset();

  mockReadTrackMetadataOverrides.mockResolvedValue({});
  mockEnsureTrackCover.mockResolvedValue(undefined);
  mockScanFilesystemPlaylists.mockResolvedValue([]);
  mockEnsureDirectoryMetadata.mockResolvedValue(undefined);
  mockFetchAlbumCoverPath.mockResolvedValue(undefined);
  mockFetchArtistPhotoPath.mockResolvedValue(undefined);
  mockWriteEmbeddedCoverToDirectory.mockResolvedValue(undefined);
  mockReadTrackOwnership.mockResolvedValue({});
  mockWriteTrackOwnership.mockResolvedValue(undefined);

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
    await writeAudioFile("artist_a/album_a/track-a.mp3", "aaa");

    const { scanFilesystemLibrary } = await import("./scannerService");
    const first = await scanFilesystemLibrary({ mode: "full" });

    mockExtractAudioMetadata.mockClear();
    await writeAudioFile("artist_a/album_a/track-b.mp3", "bbbb");

    const incremental = await scanFilesystemLibrary({ previousIndex: first });

    expect(mockExtractAudioMetadata).toHaveBeenCalledTimes(1);
    expect(mockExtractAudioMetadata).toHaveBeenCalledWith(
      expect.stringContaining(path.join("artist_a", "album_a", "track-b.mp3"))
    );
    expect(incremental.totalTracks).toBe(2);
    expect(incremental.tracks.map((track) => track.tags.title)).toEqual(["track-a", "track-b"]);
  });

  it("re-probes modified files and matches full rebuild truth", async () => {
    const trackPath = await writeAudioFile("artist_a/album_a/track-a.mp3", "aaa");

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
    const trackA = await writeAudioFile("artist_a/album_a/track-a.mp3", "aaa");
    await writeAudioFile("artist_a/album_a/track-b.mp3", "bbbb");

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
    await writeAudioFile("artist_b/album_b/z-track.mp3", "zzzz");
    await writeAudioFile("artist_a/album_a/a-track.mp3", "aa");

    const { scanFilesystemLibrary } = await import("./scannerService");
    const first = await scanFilesystemLibrary({ mode: "full" });
    expect(first.totalTracks).toBe(2);

    mockExtractAudioMetadata.mockClear();
    const second = await scanFilesystemLibrary({ previousIndex: first });

    expect(mockExtractAudioMetadata).toHaveBeenCalledTimes(0);
    expect(second.totalTracks).toBe(2);
    expect(second.tracks.map((track) => track.tags.title)).toEqual(["a-track", "z-track"]);
  });

  it("assigns owner from ownership registry", async () => {
    const relativePath = "storage/music/artist_a/album_a/track-a.mp3";
    mockReadTrackOwnership.mockResolvedValue({ [relativePath]: "user-42" });

    await writeAudioFile("artist_a/album_a/track-a.mp3", "aaa");

    const { scanFilesystemLibrary } = await import("./scannerService");
    const result = await scanFilesystemLibrary({ mode: "full" });

    expect(result.tracks[0]?.owner).toBe("user-42");
  });

  it("deduplicates same file across users via shared storage", async () => {
    await writeAudioFile("artist_a/album_a/track-a.mp3", "aaa");

    const { scanFilesystemLibrary } = await import("./scannerService");
    const result = await scanFilesystemLibrary({ mode: "full" });

    expect(result.totalTracks).toBe(1);
  });

  it("fetches album cover when album-cover.jpg is missing", async () => {
    await writeAudioFile("artist_a/album_a/track-a.mp3", "aaa");

    const albumDir = path.join(getSharedMusicRoot(), "artist_a", "album_a");
    const metadataPath = path.join(albumDir, ALBUM_METADATA_FILE);
    await fs.writeFile(path.join(albumDir, "album-cover.png"), "png", "utf8");
    await fs.writeFile(
      metadataPath,
      JSON.stringify({
        name: "album_a",
        cover: { path: "storage/music/artist_a/album_a/album-cover.png" }
      }),
      "utf8"
    );
    mockFetchAlbumCoverPath.mockResolvedValue("storage/music/artist_a/album_a/album-cover.jpg");

    const { scanFilesystemLibrary } = await import("./scannerService");
    await scanFilesystemLibrary({ mode: "full" });

    expect(mockFetchAlbumCoverPath).toHaveBeenCalledWith("artist_a", "album_a", albumDir);
    const albumMetadata = JSON.parse(await fs.readFile(metadataPath, "utf8")) as {
      cover?: { path?: string };
    };
    expect(albumMetadata.cover?.path).toBe("storage/music/artist_a/album_a/album-cover.jpg");
  });
});
