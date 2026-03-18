import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import type { LibraryIndex, Track } from "../../types/library";
import { fileExists, readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { createTrackId } from "../../utils/hash";
import { getAudioMimeType, isSupportedAudioFile } from "../../utils/mime";
import { getOwnerUploadsDir, resolveDataRelativePath } from "../../utils/paths";
import { readTrackMetadataOverrides } from "../indexer/metadataOverrideStore";
import { extractAudioMetadata } from "./audioProbe";
import { listOwnerIds, toDataRelativePath } from "../storage/storageService";
import { ensureTrackCover } from "../storage/coverService";
import { scanFilesystemPlaylists } from "../playlists/playlistStore";

const ARTIST_METADATA_FILE = "artist.json";
const ALBUM_METADATA_FILE = "album.json";
const AUDIO_DB_SEARCH_URL = "https://www.theaudiodb.com/api/v1/json/2/search.php";
const AUDIO_DB_ALBUM_SEARCH_URL = "https://www.theaudiodb.com/api/v1/json/2/searchalbum.php";
const ARTIST_PHOTO_BASE_NAME = "artist-photo";
const ALBUM_COVER_BASE_NAME = "album-cover";
const UNKNOWN_ARTIST = "Unknown Artist";
const UNKNOWN_ALBUM = "Unknown Album";

type ArtistMetadata = {
  name: string;
  photo?: {
    path: string;
  };
};

type AlbumMetadata = {
  name: string;
  cover?: {
    path: string;
  };
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

function normalizeDirectorySegment(value: string): string {
  const normalized = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return normalized || "unknown";
}

function pickImageExtension(contentType: string | null, sourceUrl: string): string {
  const normalizedContentType = contentType?.toLowerCase().trim();
  if (normalizedContentType === "image/png") {
    return ".png";
  }
  if (normalizedContentType === "image/webp") {
    return ".webp";
  }
  if (normalizedContentType === "image/jpeg" || normalizedContentType === "image/jpg") {
    return ".jpg";
  }

  try {
    const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
    if (extension === ".png" || extension === ".jpg" || extension === ".jpeg" || extension === ".webp") {
      return extension === ".jpeg" ? ".jpg" : extension;
    }
  } catch {
    return ".jpg";
  }

  return ".jpg";
}

function pickImageExtensionFromCoverFormat(format?: string): string {
  const normalizedFormat = format?.toLowerCase().trim();
  if (!normalizedFormat) {
    return ".jpg";
  }

  if (normalizedFormat.includes("png")) {
    return ".png";
  }
  if (normalizedFormat.includes("webp")) {
    return ".webp";
  }
  if (normalizedFormat.includes("jpeg") || normalizedFormat.includes("jpg")) {
    return ".jpg";
  }

  return ".jpg";
}

async function downloadImageToDirectory(
  imageUrl: string,
  targetDir: string,
  fileBaseName: string
): Promise<string | undefined> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    return undefined;
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  if (imageBuffer.length === 0) {
    return undefined;
  }

  const extension = pickImageExtension(response.headers.get("content-type"), imageUrl);
  const filePath = path.join(targetDir, `${fileBaseName}${extension}`);
  await fs.writeFile(filePath, imageBuffer);
  return toDataRelativePath(filePath);
}

async function writeEmbeddedCoverToDirectory(
  cover: { data: Buffer; format?: string } | undefined,
  targetDir: string,
  fileBaseName: string
): Promise<string | undefined> {
  if (!cover?.data || cover.data.length === 0) {
    return undefined;
  }

  const extension = pickImageExtensionFromCoverFormat(cover.format);
  const filePath = path.join(targetDir, `${fileBaseName}${extension}`);
  await fs.writeFile(filePath, cover.data);
  return toDataRelativePath(filePath);
}

async function fetchArtistPhotoPath(artistName: string, artistDir: string): Promise<string | undefined> {
  try {
    const searchUrl = new URL(AUDIO_DB_SEARCH_URL);
    searchUrl.searchParams.set("s", artistName);
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      return undefined;
    }

    const payload = (await searchResponse.json()) as {
      artists?: Array<{ strArtistThumb?: string | null }>;
    };
    const thumbUrl = payload.artists?.[0]?.strArtistThumb?.trim();
    if (!thumbUrl) {
      return undefined;
    }

    return await downloadImageToDirectory(thumbUrl, artistDir, ARTIST_PHOTO_BASE_NAME);
  } catch {
    return undefined;
  }
}

async function fetchAlbumCoverPath(
  artistName: string,
  albumName: string,
  albumDir: string
): Promise<string | undefined> {
  try {
    const searchUrl = new URL(AUDIO_DB_ALBUM_SEARCH_URL);
    searchUrl.searchParams.set("s", artistName);
    searchUrl.searchParams.set("a", albumName);
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      return undefined;
    }

    const payload = (await searchResponse.json()) as {
      album?: Array<{ strAlbumThumb?: string | null }>;
    };
    const thumbUrl = payload.album?.[0]?.strAlbumThumb?.trim();
    if (!thumbUrl) {
      return undefined;
    }

    return await downloadImageToDirectory(thumbUrl, albumDir, ALBUM_COVER_BASE_NAME);
  } catch {
    return undefined;
  }
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

  const embeddedCoverPath = await writeEmbeddedCoverToDirectory(trackCover, albumDir, ALBUM_COVER_BASE_NAME);
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

async function ensureDirectoryMetadata(directoryPath: string, metadataFileName: string, name: string): Promise<void> {
  if (!(await fileExists(directoryPath))) {
    await fs.mkdir(directoryPath, { recursive: true });
  }

  const metadataPath = path.join(directoryPath, metadataFileName);
  if (!(await fileExists(metadataPath))) {
    await writeJsonAtomic(metadataPath, { name });
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
      const embeddedCoverPath = await writeEmbeddedCoverToDirectory(metadata.cover, albumDir, ALBUM_COVER_BASE_NAME);
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

      tracks.push({
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
      });
    }
  }

  tracks.sort(compareTrackOrder);
  const playlists = await scanFilesystemPlaylists(tracks);

  return {
    generatedAt: new Date().toISOString(),
    totalTracks: tracks.length,
    tracks,
    playlists
  };
}
