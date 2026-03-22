import fs from "node:fs/promises";
import path from "node:path";

import {
  ensureDirectoryMetadata,
  fetchAlbumCoverPath,
  fetchArtistPhotoPath,
  normalizeDirectorySegment,
  writeEmbeddedCoverToDirectory
} from "../media/mediaMetadataService";
import { extractAudioMetadata } from "../scanner/audioProbe";
import { ensureTrackCover } from "../storage/coverService";
import { toDataRelativePath } from "../storage/storageService";
import type { Track } from "../../types/library";
import { fileExists, moveFile, writeJsonAtomic } from "../../utils/fs";
import { createTrackId, hashFile } from "../../utils/hash";
import { getAudioMimeType, getSupportedAudioExtensions, isSupportedAudioFile } from "../../utils/mime";

const UNKNOWN_ARTIST = "Unknown Artist";
const UNKNOWN_ALBUM = "Unknown Album";
const ARTIST_METADATA_FILE = "artist.json";
const ALBUM_METADATA_FILE = "album.json";
const ALBUM_COVER_BASE_NAME = "album-cover";

type ArtistMetadata = {
  name: string;
  photo?: { path: string };
};

type AlbumMetadata = {
  name: string;
  cover?: { path: string };
};

export type UploadMetadataOverride = {
  title?: string;
  artist?: string;
  album?: string;
};

export type ProcessedUpload = {
  trackId: string;
  track: Track;
  isNew: boolean;
  overrides?: { title?: string; artist?: string; album?: string };
};

export function sanitizeExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (!ext || !getSupportedAudioExtensions().includes(ext)) {
    return ".flac";
  }
  return ext;
}

function resolveEffectiveNames(
  metadata: { tags: { artist?: string; albumArtist?: string; artists?: string[]; album?: string } },
  manualArtist: string | undefined,
  manualAlbum: string | undefined,
  override: UploadMetadataOverride
): { artistName: string; albumName: string } {
  const artistName =
    override.artist ??
    manualArtist ??
    metadata.tags.artist ??
    metadata.tags.albumArtist ??
    metadata.tags.artists?.[0] ??
    UNKNOWN_ARTIST;

  const albumName = override.album ?? manualAlbum ?? metadata.tags.album ?? UNKNOWN_ALBUM;

  return { artistName, albumName };
}

function resolveEffectiveOverrides(
  override: UploadMetadataOverride,
  manualArtist: string | undefined,
  manualAlbum: string | undefined
): { title?: string; artist?: string; album?: string } | undefined {
  const effectiveTitle = override.title;
  const effectiveArtist = override.artist ?? manualArtist;
  const effectiveAlbum = override.album ?? manualAlbum;

  if (!effectiveTitle && !effectiveArtist && !effectiveAlbum) {
    return undefined;
  }

  return { title: effectiveTitle, artist: effectiveArtist, album: effectiveAlbum };
}

async function ensureArtistDirectory(artistDir: string, artistName: string): Promise<void> {
  const state = await ensureDirectoryMetadata(artistDir, ARTIST_METADATA_FILE, artistName);

  if (!state.createdDirectory) {
    return;
  }

  const artistPhotoPath = await fetchArtistPhotoPath(artistName, artistDir);
  if (artistPhotoPath) {
    const artistMetadata: ArtistMetadata = {
      name: artistName,
      photo: { path: artistPhotoPath }
    };
    await writeJsonAtomic(state.metadataPath, artistMetadata);
  }
}

async function ensureAlbumDirectory(
  albumDir: string,
  artistName: string,
  albumName: string,
  embeddedCover: { data: Buffer; format?: string } | undefined
): Promise<void> {
  const state = await ensureDirectoryMetadata(albumDir, ALBUM_METADATA_FILE, albumName);

  if (!state.createdDirectory) {
    return;
  }

  const embeddedCoverPath = await writeEmbeddedCoverToDirectory(embeddedCover, albumDir, ALBUM_COVER_BASE_NAME);
  const albumCoverPath = embeddedCoverPath ?? (await fetchAlbumCoverPath(artistName, albumName, albumDir));

  if (albumCoverPath) {
    const albumMetadata: AlbumMetadata = {
      name: albumName,
      cover: { path: albumCoverPath }
    };
    await writeJsonAtomic(state.metadataPath, albumMetadata);
  }
}

async function placeFile(
  uploadedFile: Express.Multer.File,
  ownerId: string,
  albumDir: string
): Promise<{ trackId: string; relativePath: string; isNew: boolean }> {
  const hash = await hashFile(uploadedFile.path);
  const extension = sanitizeExtension(uploadedFile.originalname);
  const finalFileName = `${hash}${extension}`;
  const finalPath = path.join(albumDir, finalFileName);
  const relativePath = toDataRelativePath(finalPath);
  const trackId = createTrackId(ownerId, relativePath);

  const alreadyPresent = await fileExists(finalPath);
  if (alreadyPresent) {
    await fs.unlink(uploadedFile.path);
  } else {
    await moveFile(uploadedFile.path, finalPath);
  }

  return { trackId, relativePath, isNew: !alreadyPresent };
}

/**
 * Process a single uploaded audio file: validate, extract metadata,
 * ensure directory structure, deduplicate, and produce a Track object.
 */
export async function processUploadedFile(
  uploadedFile: Express.Multer.File,
  ownerId: string,
  ownerUploadDir: string,
  manualArtist: string | undefined,
  manualAlbum: string | undefined,
  metadataOverride: UploadMetadataOverride
): Promise<ProcessedUpload> {
  if (!isSupportedAudioFile(uploadedFile.originalname)) {
    throw new Error(`Unsupported audio format: ${uploadedFile.originalname}`);
  }

  const metadata = await extractAudioMetadata(uploadedFile.path);
  const { artistName, albumName } = resolveEffectiveNames(metadata, manualArtist, manualAlbum, metadataOverride);

  const artistDir = path.join(ownerUploadDir, normalizeDirectorySegment(artistName));
  const albumDir = path.join(artistDir, normalizeDirectorySegment(albumName));

  await ensureArtistDirectory(artistDir, artistName);
  await ensureAlbumDirectory(albumDir, artistName, albumName, metadata.cover);

  const { trackId, relativePath, isNew } = await placeFile(uploadedFile, ownerId, albumDir);
  const cover = await ensureTrackCover(trackId, metadata.cover);

  const overrides = resolveEffectiveOverrides(metadataOverride, manualArtist, manualAlbum);
  const tags = {
    ...metadata.tags,
    ...(overrides?.title ? { title: overrides.title } : {}),
    ...(overrides?.artist ? { artist: overrides.artist } : {}),
    ...(overrides?.album ? { album: overrides.album } : {})
  };

  const track: Track = {
    id: trackId,
    owner: ownerId,
    path: relativePath,
    duration: metadata.duration,
    mimeType: getAudioMimeType(uploadedFile.originalname),
    codec: metadata.codec,
    bitrate: metadata.bitrate,
    sampleRate: metadata.sampleRate,
    tags,
    cover
  };

  return { trackId, track, isNew, overrides };
}
