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
const AUDIO_DB_SEARCH_URL = "https://www.theaudiodb.com/api/v1/json/2/search.php";
const ARTIST_PHOTO_BASE_NAME = "artist-photo";

type ArtistMetadata = {
  name: string;
  photo?: {
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

    const photoResponse = await fetch(thumbUrl);
    if (!photoResponse.ok) {
      return undefined;
    }

    const photoBuffer = Buffer.from(await photoResponse.arrayBuffer());
    if (photoBuffer.length === 0) {
      return undefined;
    }

    const extension = pickImageExtension(photoResponse.headers.get("content-type"), thumbUrl);
    const artistPhotoPath = path.join(artistDir, `${ARTIST_PHOTO_BASE_NAME}${extension}`);
    await fs.writeFile(artistPhotoPath, photoBuffer);
    return toDataRelativePath(artistPhotoPath);
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

  for (const ownerId of ownerIds) {
    const uploadsDir = getOwnerUploadsDir(ownerId);
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
