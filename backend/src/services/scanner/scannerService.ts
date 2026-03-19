import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import type { LibraryIndex, Track } from "../../types/library";
import { fileExists, readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { createAlbumId, createTrackId } from "../../utils/hash";
import { getAudioMimeType, isSupportedAudioFile } from "../../utils/mime";
import { getOwnerUploadsDir, resolveDataRelativePath } from "../../utils/paths";
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

export async function scanFilesystemLibrary(): Promise<LibraryIndex> {
  const ownerIds = await listOwnerIds();
  const metadataOverrides = await readTrackMetadataOverrides();
  const tracks: Track[] = [];
  const albumsByDirectory = new Map<string, AlbumAggregate>();
  const processedArtists = new Set<string>();
  const processedAlbums = new Set<string>();

  for (const ownerId of ownerIds) {
    const uploadsDir = getOwnerUploadsDir(ownerId);
    await sortRootUploadFiles(ownerId, uploadsDir, metadataOverrides);
    const files = await collectAudioFiles(uploadsDir);

    for (const filePath of files) {
      const relativePath = toDataRelativePath(filePath);
      const metadata = await extractAudioMetadata(filePath);
      const trackId = createTrackId(ownerId, relativePath);
      const cover = await ensureTrackCover(trackId, metadata.cover);
      const metadataOverride = metadataOverrides[trackId];
      const tags = {
        ...metadata.tags,
        title: metadataOverride?.title ?? metadata.tags.title,
        artist: metadataOverride?.artist ?? metadata.tags.artist,
        album: metadataOverride?.album ?? metadata.tags.album
      };

      const artistName = tags.artist ?? tags.albumArtist ?? tags.artists?.[0];
      if (artistName) {
        const artistKey = `${ownerId}:${artistName.toLocaleLowerCase()}`;
        if (!processedArtists.has(artistKey)) {
          processedArtists.add(artistKey);
          await ensureArtistPhotoForTrack(ownerId, artistName);
        }
      }

      const albumArtistName = artistName ?? UNKNOWN_ARTIST;
      const albumName = tags.album ?? UNKNOWN_ALBUM;
      const albumKey = `${ownerId}:${albumArtistName.toLocaleLowerCase()}:${albumName.toLocaleLowerCase()}`;
      if (!processedAlbums.has(albumKey)) {
        processedAlbums.add(albumKey);
        await ensureAlbumCoverForTrack(ownerId, albumArtistName, albumName, metadata.cover);
      }

      const track: Track = {
        id: trackId,
        owner: ownerId,
        path: relativePath,
        duration: metadata.duration,
        mimeType: getAudioMimeType(filePath),
        codec: metadata.codec,
        bitrate: metadata.bitrate,
        sampleRate: metadata.sampleRate,
        tags,
        cover
      };

      tracks.push(track);

      const albumDir = path.dirname(filePath);
      const currentAlbum = albumsByDirectory.get(albumDir);
      if (currentAlbum) {
        currentAlbum.tracks.push(track);
      } else {
        const metadataPath = path.join(albumDir, ALBUM_METADATA_FILE);
        const albumMetadata = await readJsonFile<AlbumMetadata | null>(metadataPath, null);
        const currentName = albumMetadata?.name?.trim() ? albumMetadata.name : albumName;
        albumsByDirectory.set(albumDir, {
          ownerId,
          albumDir,
          id: albumMetadata?.id,
          name: currentName,
          coverPath: albumMetadata?.cover?.path,
          tracks: [track]
        });
      }
    }
  }

  await flushAlbumMetadata(albumsByDirectory);
  tracks.sort(compareTrackOrder);
  const playlists = await scanFilesystemPlaylists(tracks);

  return {
    generatedAt: new Date().toISOString(),
    totalTracks: tracks.length,
    tracks,
    playlists
  };
}
