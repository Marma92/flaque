import path from "node:path";

import type { Track } from "../../types/library";
import { fileExists, readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { createAlbumId } from "../../utils/hash";
import { ALBUM_METADATA_FILE, ARTIST_METADATA_FILE, UNKNOWN_ARTIST, UNKNOWN_ALBUM } from "../../utils/music";
import { resolveDataRelativePath, sharedMusicRoot } from "../../utils/paths";
import {
  fetchAlbumCoverPath,
  fetchArtistPhotoPath,
  normalizeDirectorySegment,
  writeEmbeddedCoverToDirectory
} from "../media/mediaMetadataService";
import { toDataRelativePath } from "../storage/storageService";

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

export type AlbumAggregate = {
  albumDir: string;
  id?: string;
  name: string;
  coverPath?: string;
  tracks: Track[];
};

async function hasMediaFile(metadataPath: string | undefined): Promise<boolean> {
  if (!metadataPath) {
    return false;
  }

  try {
    const absolutePath = resolveDataRelativePath(metadataPath);
    return await fileExists(absolutePath);
  } catch {
    return false;
  }
}

export async function ensureArtistPhotoForTrack(artistName: string): Promise<void> {
  const artistDir = path.join(sharedMusicRoot, normalizeDirectorySegment(artistName));
  if (!(await fileExists(artistDir))) {
    return;
  }

  const metadataPath = path.join(artistDir, ARTIST_METADATA_FILE);
  const metadata = await readJsonFile<ArtistMetadata | null>(metadataPath, null);
  const existingName = metadata?.name?.trim() ? metadata.name : artistName;
  if (metadata && (await hasMediaFile(metadata.photo?.path))) {
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
    photo: { path: artistPhotoPath }
  });
}

export async function ensureAlbumCoverForTrack(
  artistName: string,
  albumName: string,
  trackCover: { data: Buffer; format?: string } | undefined
): Promise<void> {
  const artistDir = path.join(sharedMusicRoot, normalizeDirectorySegment(artistName));
  const albumDir = path.join(artistDir, normalizeDirectorySegment(albumName));
  if (!(await fileExists(albumDir))) {
    return;
  }

  const metadataPath = path.join(albumDir, ALBUM_METADATA_FILE);
  const metadata = await readJsonFile<AlbumMetadata | null>(metadataPath, null);
  const existingName = metadata?.name?.trim() ? metadata.name : albumName;
  if (metadata && (await hasMediaFile(metadata.cover?.path))) {
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
    cover: { path: coverPath }
  });
}

export async function ensureTrackMediaMetadata(
  track: Track,
  trackCover: { data: Buffer; format?: string } | undefined,
  processedArtists: Set<string>,
  processedAlbums: Set<string>
): Promise<void> {
  const artistName = track.tags.artist ?? track.tags.albumArtist ?? track.tags.artists?.[0];
  if (artistName) {
    const artistKey = artistName.toLocaleLowerCase();
    if (!processedArtists.has(artistKey)) {
      processedArtists.add(artistKey);
      await ensureArtistPhotoForTrack(artistName);
    }
  }

  const albumArtistName = artistName ?? UNKNOWN_ARTIST;
  const albumName = track.tags.album ?? UNKNOWN_ALBUM;
  const albumKey = `${albumArtistName.toLocaleLowerCase()}:${albumName.toLocaleLowerCase()}`;
  if (!processedAlbums.has(albumKey)) {
    processedAlbums.add(albumKey);
    await ensureAlbumCoverForTrack(albumArtistName, albumName, trackCover);
  }
}

export async function addTrackToAlbumAggregate(
  track: Track,
  filePath: string,
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
    albumDir,
    id: albumMetadata?.id,
    name: currentName,
    coverPath: albumMetadata?.cover?.path,
    tracks: [track]
  });
}

export async function flushAlbumMetadata(albums: Map<string, AlbumAggregate>): Promise<void> {
  for (const album of albums.values()) {
    const albumRelativePath = toDataRelativePath(album.albumDir);
    const metadataPath = path.join(album.albumDir, ALBUM_METADATA_FILE);
    const metadata: AlbumMetadata = {
      id: album.id?.trim() || createAlbumId(albumRelativePath),
      name: album.name,
      ...(album.coverPath ? { cover: { path: album.coverPath } } : {}),
      tracks: album.tracks
    };

    await writeJsonAtomic(metadataPath, metadata);
  }
}
