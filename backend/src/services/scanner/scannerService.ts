import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import type { LibraryIndex, Track } from "../../types/library";
import { fileExists, readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { createAlbumId, createTrackId } from "../../utils/hash";
import { getAudioMimeType, isSupportedAudioFile } from "../../utils/mime";
import { getOwnerUploadsDir, indexFilePath, resolveDataRelativePath, scannerStateFilePath } from "../../utils/paths";
import { readTrackMetadataOverrides } from "../indexer/metadataOverrideStore";
import {
  ensureDirectoryMetadata,
  fetchAlbumCoverPath,
  fetchArtistPhotoPath,
  normalizeDirectorySegment,
  writeEmbeddedCoverToDirectory
} from "../media/mediaMetadataService";
import { extractAudioMetadata } from "./audioProbe";
import { listOwnerIds, toDataRelativePath } from "../storage/storageService";
import { ensureTrackCover } from "../storage/coverService";
import { scanFilesystemPlaylists } from "../playlists/playlistStore";

const ARTIST_METADATA_FILE = "artist.json";
const ALBUM_METADATA_FILE = "album.json";
const UNKNOWN_ARTIST = "Unknown Artist";
const UNKNOWN_ALBUM = "Unknown Album";

type ArtistMetadata = {
  name: string;
  photo?: {
    path: string;
  };
};

type AlbumMetadata = {
  id?: string;
  name: string;
  cover?: {
    path: string;
  };
  tracks?: Track[];
};

type AlbumAggregate = {
  ownerId: string;
  albumDir: string;
  id?: string;
  name: string;
  coverPath?: string;
  tracks: Track[];
};

type ScanMode = "incremental" | "full";

type ScanFilesystemLibraryOptions = {
  mode?: ScanMode;
  previousIndex?: LibraryIndex;
};

type FileSystemTrackState = {
  ownerId: string;
  filePath: string;
  relativePath: string;
  trackId: string;
  size: number;
  mtimeMs: number;
  identity: string;
};

type ScannerTrackState = {
  trackId: string;
  path: string;
  size: number;
  mtimeMs: number;
  identity: string;
};

type ScannerStateSnapshot = {
  version: 1;
  tracks: ScannerTrackState[];
};

type ClassifiedTracks = {
  changed: FileSystemTrackState[];
  unchanged: Array<{
    state: FileSystemTrackState;
    track: Track;
  }>;
  deletedTrackIds: string[];
};

const SCANNER_STATE_VERSION = 1;

function getTrackArtist(track: Track): string {
  return track.tags.artist ?? track.tags.albumArtist ?? track.tags.artists?.[0] ?? "";
}

function getTrackAlbum(track: Track): string {
  return track.tags.album ?? "";
}

function getTrackTitle(track: Track): string {
  return track.tags.title ?? track.path;
}

async function hasArtistPhoto(metadata: ArtistMetadata): Promise<boolean> {
  const photoPath = metadata.photo?.path;
  if (!photoPath) {
    return false;
  }

  try {
    const absolutePhotoPath = resolveDataRelativePath(photoPath);
    return await fileExists(absolutePhotoPath);
  } catch {
    return false;
  }
}

async function ensureArtistPhotoForTrack(ownerId: string, artistName: string): Promise<void> {
  const artistDir = path.join(getOwnerUploadsDir(ownerId), normalizeDirectorySegment(artistName));
  if (!(await fileExists(artistDir))) {
    return;
  }

  const metadataPath = path.join(artistDir, ARTIST_METADATA_FILE);
  const metadata = await readJsonFile<ArtistMetadata | null>(metadataPath, null);
  const existingName = metadata?.name?.trim() ? metadata.name : artistName;
  if (metadata && (await hasArtistPhoto(metadata))) {
    return;
  }

  const artistPhotoPath = await fetchArtistPhotoPath(existingName, artistDir);
  if (!artistPhotoPath) {
    if (!metadata) {
      await writeJsonAtomic(metadataPath, { name: existingName });
    }
    return;
  }

  await writeJsonAtomic(metadataPath, {
    name: existingName,
    photo: {
      path: artistPhotoPath
    }
  });
}

async function hasAlbumCover(metadata: AlbumMetadata): Promise<boolean> {
  const coverPath = metadata.cover?.path;
  if (!coverPath) {
    return false;
  }

  try {
    const absoluteCoverPath = resolveDataRelativePath(coverPath);
    return await fileExists(absoluteCoverPath);
  } catch {
    return false;
  }
}

async function ensureAlbumCoverForTrack(
  ownerId: string,
  artistName: string,
  albumName: string,
  trackCover: { data: Buffer; format?: string } | undefined
): Promise<void> {
  const artistDir = path.join(getOwnerUploadsDir(ownerId), normalizeDirectorySegment(artistName));
  const albumDir = path.join(artistDir, normalizeDirectorySegment(albumName));
  if (!(await fileExists(albumDir))) {
    return;
  }

  const metadataPath = path.join(albumDir, ALBUM_METADATA_FILE);
  const metadata = await readJsonFile<AlbumMetadata | null>(metadataPath, null);
  const existingName = metadata?.name?.trim() ? metadata.name : albumName;
  if (metadata && (await hasAlbumCover(metadata))) {
    return;
  }

  const embeddedCoverPath = await writeEmbeddedCoverToDirectory(trackCover, albumDir, "album-cover");
  const coverPath = embeddedCoverPath ?? (await fetchAlbumCoverPath(artistName, existingName, albumDir));
  if (!coverPath) {
    if (!metadata) {
      await writeJsonAtomic(metadataPath, { name: existingName });
    }
    return;
  }

  await writeJsonAtomic(metadataPath, {
    name: existingName,
    cover: {
      path: coverPath
    }
  });
}

async function flushAlbumMetadata(albums: Map<string, AlbumAggregate>): Promise<void> {
  for (const album of albums.values()) {
    const albumRelativePath = toDataRelativePath(album.albumDir);
    const metadataPath = path.join(album.albumDir, ALBUM_METADATA_FILE);
    const metadata: AlbumMetadata = {
      id: album.id?.trim() || createAlbumId(album.ownerId, albumRelativePath),
      name: album.name,
      ...(album.coverPath
        ? {
            cover: {
              path: album.coverPath
            }
          }
        : {}),
      tracks: album.tracks
    };

    await writeJsonAtomic(metadataPath, metadata);
  }
}

async function sortRootUploadFiles(
  ownerId: string,
  uploadsDir: string,
  metadataOverrides: Record<string, { artist?: string; album?: string }>
): Promise<void> {
  let entries: Dirent[] = [];

  try {
    entries = await fs.readdir(uploadsDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      continue;
    }

    const sourcePath = path.join(uploadsDir, entry.name);
    if (!isSupportedAudioFile(sourcePath)) {
      continue;
    }

    const relativePath = toDataRelativePath(sourcePath);
    const trackId = createTrackId(ownerId, relativePath);
    const metadataOverride = metadataOverrides[trackId];
    const metadata = await extractAudioMetadata(sourcePath);

    const artistName =
      metadataOverride?.artist ??
      metadata.tags.artist ??
      metadata.tags.albumArtist ??
      metadata.tags.artists?.[0] ??
      UNKNOWN_ARTIST;
    const albumName = metadataOverride?.album ?? metadata.tags.album ?? UNKNOWN_ALBUM;

    const artistDir = path.join(uploadsDir, normalizeDirectorySegment(artistName));
    await ensureDirectoryMetadata(artistDir, ARTIST_METADATA_FILE, artistName);

    const albumDir = path.join(artistDir, normalizeDirectorySegment(albumName));
    await ensureDirectoryMetadata(albumDir, ALBUM_METADATA_FILE, albumName);

    const albumMetadataPath = path.join(albumDir, ALBUM_METADATA_FILE);
    const albumMetadata = await readJsonFile<AlbumMetadata | null>(albumMetadataPath, null);
    if (!albumMetadata || !(await hasAlbumCover(albumMetadata))) {
      const embeddedCoverPath = await writeEmbeddedCoverToDirectory(metadata.cover, albumDir, "album-cover");
      if (embeddedCoverPath) {
        await writeJsonAtomic(albumMetadataPath, {
          name: albumMetadata?.name?.trim() ? albumMetadata.name : albumName,
          cover: {
            path: embeddedCoverPath
          }
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

function createTrackIdentity(relativePath: string, mtimeMs: number, size: number): string {
  return `${relativePath}:${mtimeMs}:${size}`;
}

async function collectFilesystemState(
  ownerIds: string[],
  metadataOverrides: Record<string, { artist?: string; album?: string }>
): Promise<FileSystemTrackState[]> {
  const states: FileSystemTrackState[] = [];

  for (const ownerId of ownerIds) {
    const uploadsDir = getOwnerUploadsDir(ownerId);
    await sortRootUploadFiles(ownerId, uploadsDir, metadataOverrides);
    const files = await collectAudioFiles(uploadsDir);

    for (const filePath of files) {
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch {
        continue;
      }

      const relativePath = toDataRelativePath(filePath);
      const trackId = createTrackId(ownerId, relativePath);
      const identity = createTrackIdentity(relativePath, stats.mtimeMs, stats.size);

      states.push({
        ownerId,
        filePath,
        relativePath,
        trackId,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        identity
      });
    }
  }

  return states;
}

function normalizeScannerState(raw: unknown): ScannerStateSnapshot {
  if (!raw || typeof raw !== "object") {
    return { version: SCANNER_STATE_VERSION, tracks: [] };
  }

  const source = raw as {
    version?: unknown;
    tracks?: unknown;
  };

  if (source.version !== SCANNER_STATE_VERSION || !Array.isArray(source.tracks)) {
    return { version: SCANNER_STATE_VERSION, tracks: [] };
  }

  const tracks: ScannerTrackState[] = [];
  for (const item of source.tracks) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = item as Partial<ScannerTrackState>;
    if (
      typeof candidate.trackId !== "string" ||
      typeof candidate.path !== "string" ||
      typeof candidate.identity !== "string" ||
      typeof candidate.size !== "number" ||
      typeof candidate.mtimeMs !== "number"
    ) {
      continue;
    }

    tracks.push({
      trackId: candidate.trackId,
      path: candidate.path,
      identity: candidate.identity,
      size: candidate.size,
      mtimeMs: candidate.mtimeMs
    });
  }

  return {
    version: SCANNER_STATE_VERSION,
    tracks
  };
}

async function readScannerState(): Promise<ScannerStateSnapshot> {
  const raw = await readJsonFile<unknown>(scannerStateFilePath, {
    version: SCANNER_STATE_VERSION,
    tracks: []
  });

  return normalizeScannerState(raw);
}

async function writeScannerState(states: FileSystemTrackState[]): Promise<void> {
  const snapshot: ScannerStateSnapshot = {
    version: SCANNER_STATE_VERSION,
    tracks: states.map((state) => ({
      trackId: state.trackId,
      path: state.relativePath,
      size: state.size,
      mtimeMs: state.mtimeMs,
      identity: state.identity
    }))
  };

  await fs.mkdir(path.dirname(scannerStateFilePath), { recursive: true });
  await writeJsonAtomic(scannerStateFilePath, snapshot);
}

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

  return {
    changed,
    unchanged,
    deletedTrackIds
  };
}

function applyTrackMetadataOverride(
  track: Track,
  metadataOverride?: { title?: string; artist?: string; album?: string }
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
      album: metadataOverride.album ?? track.tags.album
    }
  };
}

async function ensureTrackMediaMetadata(
  track: Track,
  ownerId: string,
  trackCover: { data: Buffer; format?: string } | undefined,
  processedArtists: Set<string>,
  processedAlbums: Set<string>
): Promise<void> {
  const artistName = track.tags.artist ?? track.tags.albumArtist ?? track.tags.artists?.[0];
  if (artistName) {
    const artistKey = `${ownerId}:${artistName.toLocaleLowerCase()}`;
    if (!processedArtists.has(artistKey)) {
      processedArtists.add(artistKey);
      await ensureArtistPhotoForTrack(ownerId, artistName);
    }
  }

  const albumArtistName = artistName ?? UNKNOWN_ARTIST;
  const albumName = track.tags.album ?? UNKNOWN_ALBUM;
  const albumKey = `${ownerId}:${albumArtistName.toLocaleLowerCase()}:${albumName.toLocaleLowerCase()}`;
  if (!processedAlbums.has(albumKey)) {
    processedAlbums.add(albumKey);
    await ensureAlbumCoverForTrack(ownerId, albumArtistName, albumName, trackCover);
  }
}

async function addTrackToAlbumAggregate(
  track: Track,
  filePath: string,
  ownerId: string,
  fallbackAlbumName: string,
  albumsByDirectory: Map<string, AlbumAggregate>
): Promise<void> {
  const albumDir = path.dirname(filePath);
  const currentAlbum = albumsByDirectory.get(albumDir);

  if (currentAlbum) {
    currentAlbum.tracks.push(track);
    return;
  }

  const metadataPath = path.join(albumDir, ALBUM_METADATA_FILE);
  const albumMetadata = await readJsonFile<AlbumMetadata | null>(metadataPath, null);
  const currentName = albumMetadata?.name?.trim() ? albumMetadata.name : fallbackAlbumName;

  albumsByDirectory.set(albumDir, {
    ownerId,
    albumDir,
    id: albumMetadata?.id,
    name: currentName,
    coverPath: albumMetadata?.cover?.path,
    tracks: [track]
  });
}

async function probeChangedTracks(
  changedTracks: FileSystemTrackState[],
  metadataOverrides: Record<string, { title?: string; artist?: string; album?: string }>,
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
      cover
    };

    await ensureTrackMediaMetadata(track, state.ownerId, metadata.cover, processedArtists, processedAlbums);
    await addTrackToAlbumAggregate(track, state.filePath, state.ownerId, tags.album ?? UNKNOWN_ALBUM, albumsByDirectory);
    tracks.push(track);
  }

  return tracks;
}

async function mergeFinalTracks(
  unchangedTracks: ClassifiedTracks["unchanged"],
  changedTracks: Track[],
  metadataOverrides: Record<string, { title?: string; artist?: string; album?: string }>,
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
    await ensureTrackMediaMetadata(withOverrides, unchanged.state.ownerId, undefined, processedArtists, processedAlbums);
    await addTrackToAlbumAggregate(
      withOverrides,
      unchanged.state.filePath,
      unchanged.state.ownerId,
      withOverrides.tags.album ?? UNKNOWN_ALBUM,
      albumsByDirectory
    );
    mergedTracks.push(withOverrides);
  }

  mergedTracks.push(...changedTracks);
  mergedTracks.sort(compareTrackOrder);
  return mergedTracks;
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

async function performScan(
  mode: ScanMode,
  previousIndex: LibraryIndex | undefined,
  metadataOverrides: Record<string, { title?: string; artist?: string; album?: string }>
): Promise<LibraryIndex> {
  const ownerIds = await listOwnerIds();
  const filesystemState = await collectFilesystemState(ownerIds, metadataOverrides);
  const previousTracks = previousIndex?.tracks ?? [];
  const previousScannerState: ScannerStateSnapshot = mode === "incremental" ? await readScannerState() : {
    version: SCANNER_STATE_VERSION,
    tracks: []
  };
  const classified = classifyTrackChanges(filesystemState, previousTracks, previousScannerState);
  const albumsByDirectory = new Map<string, AlbumAggregate>();
  const processedArtists = new Set<string>();
  const processedAlbums = new Set<string>();

  const changedTracks = await probeChangedTracks(
    classified.changed,
    metadataOverrides,
    albumsByDirectory,
    processedArtists,
    processedAlbums
  );
  const tracks = await mergeFinalTracks(
    classified.unchanged,
    changedTracks,
    metadataOverrides,
    albumsByDirectory,
    processedArtists,
    processedAlbums
  );

  await flushAlbumMetadata(albumsByDirectory);
  await writeScannerState(filesystemState);
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
