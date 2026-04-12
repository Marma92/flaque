import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import type { LibraryIndex, Track } from "../../types/library";
import { fileExists, readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { createTrackId } from "../../utils/hash";
import { getAudioMimeType, isSupportedAudioFile } from "../../utils/mime";
import { getTrackArtist, getTrackAlbum, getTrackTitle, UNKNOWN_ARTIST, UNKNOWN_ALBUM, ARTIST_METADATA_FILE, ALBUM_METADATA_FILE } from "../../utils/music";
import { indexFilePath, sharedMusicRoot } from "../../utils/paths";
import { readTrackMetadataOverrides } from "../indexer/metadataOverrideStore";
import { ensureDirectoryMetadata, normalizeDirectorySegment, writeEmbeddedCoverToDirectory } from "../media/mediaMetadataService";
import { extractAudioMetadata } from "./audioProbe";
import { toDataRelativePath } from "../storage/storageService";
import { ensureTrackCover } from "../storage/coverService";
import { readTrackOwnership, writeTrackOwnership } from "../storage/ownershipStore";
import { scanFilesystemPlaylists } from "../playlists/playlistStore";
import {
  type AlbumAggregate,
  addTrackToAlbumAggregate,
  ensureTrackMediaMetadata,
  flushAlbumMetadata
} from "./scannerMedia";
import {
  type FileSystemTrackState,
  type ScannerStateSnapshot,
  createEmptyScannerState,
  createTrackIdentity,
  readScannerState,
  writeScannerState
} from "./scannerState";

type AlbumMetadata = {
  name?: string;
  cover?: { path: string };
};

type ScanMode = "incremental" | "full";

type ScanFilesystemLibraryOptions = {
  mode?: ScanMode;
  previousIndex?: LibraryIndex;
};

type ClassifiedTracks = {
  changed: FileSystemTrackState[];
  unchanged: Array<{
    state: FileSystemTrackState;
    track: Track;
  }>;
  deletedTrackIds: string[];
};

// ── Filesystem traversal ────────────────────────────────────────────────

async function sortRootMusicFiles(
  metadataOverrides: Record<string, { artist?: string; album?: string; year?: number }>
): Promise<void> {
  let entries: Dirent[] = [];

  try {
    entries = await fs.readdir(sharedMusicRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      continue;
    }

    const sourcePath = path.join(sharedMusicRoot, entry.name);
    if (!isSupportedAudioFile(sourcePath)) {
      continue;
    }

    const relativePath = toDataRelativePath(sourcePath);
    const trackId = createTrackId(relativePath);
    const metadataOverride = metadataOverrides[trackId];
    const metadata = await extractAudioMetadata(sourcePath);

    const artistName =
      metadataOverride?.artist ??
      metadata.tags.artist ??
      metadata.tags.albumArtist ??
      metadata.tags.artists?.[0] ??
      UNKNOWN_ARTIST;
    const albumName = metadataOverride?.album ?? metadata.tags.album ?? UNKNOWN_ALBUM;

    const artistDir = path.join(sharedMusicRoot, normalizeDirectorySegment(artistName));
    await ensureDirectoryMetadata(artistDir, ARTIST_METADATA_FILE, artistName);

    const albumDir = path.join(artistDir, normalizeDirectorySegment(albumName));
    await ensureDirectoryMetadata(albumDir, ALBUM_METADATA_FILE, albumName);

    const albumMetadataPath = path.join(albumDir, ALBUM_METADATA_FILE);
    const albumMetadata = await readJsonFile<AlbumMetadata | null>(albumMetadataPath, null);
    if (!albumMetadata?.cover?.path) {
      const embeddedCoverPath = await writeEmbeddedCoverToDirectory(metadata.cover, albumDir, "album-cover");
      if (embeddedCoverPath) {
        await writeJsonAtomic(albumMetadataPath, {
          name: albumMetadata?.name?.trim() ? albumMetadata.name : albumName,
          cover: { path: embeddedCoverPath }
        });
      }
    }

    const targetPath = path.join(albumDir, entry.name);
    if (await fileExists(targetPath)) {
      await fs.unlink(sourcePath);
      continue;
    }

    await fs.rename(sourcePath, targetPath);
  }
}

async function collectAudioFiles(rootDir: string): Promise<string[]> {
  const queue = [rootDir];
  const files: string[] = [];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      const absoluteEntryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absoluteEntryPath);
        continue;
      }

      if (entry.isFile() && isSupportedAudioFile(absoluteEntryPath)) {
        files.push(absoluteEntryPath);
      }
    }
  }

  return files;
}

async function collectFilesystemState(
  ownership: Record<string, string>,
  metadataOverrides: Record<string, { artist?: string; album?: string; year?: number }>
): Promise<FileSystemTrackState[]> {
  const states: FileSystemTrackState[] = [];

  await sortRootMusicFiles(metadataOverrides);
  const files = await collectAudioFiles(sharedMusicRoot);

  for (const filePath of files) {
    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch {
      continue;
    }

    const relativePath = toDataRelativePath(filePath);
    const trackId = createTrackId(relativePath);
    const ownerId = ownership[relativePath] ?? "";
    const identity = createTrackIdentity(relativePath, stats.mtimeMs, stats.size);

    states.push({ ownerId, filePath, relativePath, trackId, size: stats.size, mtimeMs: stats.mtimeMs, identity });
  }

  return states;
}

// ── Change detection ────────────────────────────────────────────────────

function classifyTrackChanges(
  filesystemState: FileSystemTrackState[],
  previousTracks: Track[],
  previousScannerState: ScannerStateSnapshot
): ClassifiedTracks {
  const currentTrackIds = new Set<string>();
  const previousTracksById = new Map(previousTracks.map((track) => [track.id, track]));
  const previousStateByTrackId = new Map(previousScannerState.tracks.map((state) => [state.trackId, state]));

  const changed: FileSystemTrackState[] = [];
  const unchanged: ClassifiedTracks["unchanged"] = [];

  for (const state of filesystemState) {
    currentTrackIds.add(state.trackId);
    const previousState = previousStateByTrackId.get(state.trackId);
    const previousTrack = previousTracksById.get(state.trackId);

    if (previousState && previousTrack && previousState.identity === state.identity) {
      unchanged.push({ state, track: previousTrack });
      continue;
    }

    changed.push(state);
  }

  const deletedTrackIds: string[] = [];
  for (const previousTrack of previousTracks) {
    if (!currentTrackIds.has(previousTrack.id)) {
      deletedTrackIds.push(previousTrack.id);
    }
  }

  return { changed, unchanged, deletedTrackIds };
}

// ── Track building ──────────────────────────────────────────────────────

function applyTrackMetadataOverride(
  track: Track,
  metadataOverride?: { title?: string; artist?: string; album?: string; year?: number }
): Track {
  if (!metadataOverride) {
    return track;
  }

  return {
    ...track,
    tags: {
      ...track.tags,
      title: metadataOverride.title ?? track.tags.title,
      artist: metadataOverride.artist ?? track.tags.artist,
      album: metadataOverride.album ?? track.tags.album,
      year: metadataOverride.year ?? track.tags.year
    }
  };
}

async function probeChangedTracks(
  changedTracks: FileSystemTrackState[],
  metadataOverrides: Record<string, { title?: string; artist?: string; album?: string; year?: number }>,
  albumsByDirectory: Map<string, AlbumAggregate>,
  processedArtists: Set<string>,
  processedAlbums: Set<string>
): Promise<Track[]> {
  const tracks: Track[] = [];

  for (const state of changedTracks) {
    const metadata = await extractAudioMetadata(state.filePath);
    const metadataOverride = metadataOverrides[state.trackId];
    const cover = await ensureTrackCover(state.trackId, metadata.cover);
    const tags = {
      ...metadata.tags,
      title: metadataOverride?.title ?? metadata.tags.title,
      artist: metadataOverride?.artist ?? metadata.tags.artist,
      album: metadataOverride?.album ?? metadata.tags.album
    };

    const track: Track = {
      id: state.trackId,
      owner: state.ownerId,
      path: state.relativePath,
      duration: metadata.duration,
      mimeType: getAudioMimeType(state.filePath),
      codec: metadata.codec,
      bitrate: metadata.bitrate,
      sampleRate: metadata.sampleRate,
      tags,
      cover,
      addedAt: new Date().toISOString()
    };

    await ensureTrackMediaMetadata(track, metadata.cover, processedArtists, processedAlbums);
    await addTrackToAlbumAggregate(track, state.filePath, tags.album ?? UNKNOWN_ALBUM, albumsByDirectory);
    tracks.push(track);
  }

  return tracks;
}

function compareTrackOrder(a: Track, b: Track): number {
  const byArtist = getTrackArtist(a).localeCompare(getTrackArtist(b));
  if (byArtist !== 0) {
    return byArtist;
  }

  const byAlbum = getTrackAlbum(a).localeCompare(getTrackAlbum(b));
  if (byAlbum !== 0) {
    return byAlbum;
  }

  return getTrackTitle(a).localeCompare(getTrackTitle(b));
}

async function mergeFinalTracks(
  unchangedTracks: ClassifiedTracks["unchanged"],
  changedTracks: Track[],
  metadataOverrides: Record<string, { title?: string; artist?: string; album?: string; year?: number }>,
  albumsByDirectory: Map<string, AlbumAggregate>,
  processedArtists: Set<string>,
  processedAlbums: Set<string>
): Promise<Track[]> {
  const mergedTracks: Track[] = [];

  for (const unchanged of unchangedTracks) {
    const withOverrides = applyTrackMetadataOverride(
      unchanged.track,
      metadataOverrides[unchanged.state.trackId]
    );
    await ensureTrackMediaMetadata(withOverrides, undefined, processedArtists, processedAlbums);
    await addTrackToAlbumAggregate(
      withOverrides,
      unchanged.state.filePath,
      withOverrides.tags.album ?? UNKNOWN_ALBUM,
      albumsByDirectory
    );
    mergedTracks.push(withOverrides);
  }

  mergedTracks.push(...changedTracks);
  mergedTracks.sort(compareTrackOrder);
  return mergedTracks;
}

// ── Scan orchestration ──────────────────────────────────────────────────

async function performScan(
  mode: ScanMode,
  previousIndex: LibraryIndex | undefined,
  metadataOverrides: Record<string, { title?: string; artist?: string; album?: string; year?: number }>
): Promise<LibraryIndex> {
  const ownership = await readTrackOwnership();
  const filesystemState = await collectFilesystemState(ownership, metadataOverrides);
  const previousTracks = previousIndex?.tracks ?? [];
  const previousScannerState = mode === "incremental" ? await readScannerState() : createEmptyScannerState();
  const classified = classifyTrackChanges(filesystemState, previousTracks, previousScannerState);
  const albumsByDirectory = new Map<string, AlbumAggregate>();
  const processedArtists = new Set<string>();
  const processedAlbums = new Set<string>();

  const changedTracks = await probeChangedTracks(
    classified.changed, metadataOverrides, albumsByDirectory, processedArtists, processedAlbums
  );
  const tracks = await mergeFinalTracks(
    classified.unchanged, changedTracks, metadataOverrides, albumsByDirectory, processedArtists, processedAlbums
  );

  await flushAlbumMetadata(albumsByDirectory);
  await writeScannerState(filesystemState);

  const validPaths = new Set(filesystemState.map((state) => state.relativePath));
  const prunedOwnership: Record<string, string> = {};
  for (const [trackPath, owner] of Object.entries(ownership)) {
    if (validPaths.has(trackPath)) {
      prunedOwnership[trackPath] = owner;
    }
  }
  await writeTrackOwnership(prunedOwnership);

  const playlists = await scanFilesystemPlaylists(tracks);

  return {
    generatedAt: new Date().toISOString(),
    totalTracks: tracks.length,
    tracks,
    playlists
  };
}

export async function scanFilesystemLibrary(options: ScanFilesystemLibraryOptions = {}): Promise<LibraryIndex> {
  const metadataOverrides = await readTrackMetadataOverrides();
  const modeFromEnvironment = process.env.SCANNER_REBUILD_MODE === "full" ? "full" : "incremental";
  const requestedMode = options.mode ?? modeFromEnvironment;
  const previousIndex =
    options.previousIndex ??
    (await readJsonFile<LibraryIndex>(indexFilePath, {
      generatedAt: "",
      totalTracks: 0,
      tracks: [],
      playlists: []
    }));

  if (requestedMode === "full") {
    return performScan("full", previousIndex, metadataOverrides);
  }

  try {
    return await performScan("incremental", previousIndex, metadataOverrides);
  } catch {
    return performScan("full", previousIndex, metadataOverrides);
  }
}
