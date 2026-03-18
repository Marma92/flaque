import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import type { LibraryIndex, Track } from "../../types/library";
import { createTrackId } from "../../utils/hash";
import { getAudioMimeType, isSupportedAudioFile } from "../../utils/mime";
import { getOwnerUploadsDir } from "../../utils/paths";
import { readTrackMetadataOverrides } from "../indexer/metadataOverrideStore";
import { extractAudioMetadata } from "./audioProbe";
import { listOwnerIds, toDataRelativePath } from "../storage/storageService";
import { ensureTrackCover } from "../storage/coverService";
import { scanFilesystemPlaylists } from "../playlists/playlistStore";

function getTrackArtist(track: Track): string {
  return track.tags.artist ?? track.tags.albumArtist ?? track.tags.artists?.[0] ?? "";
}

function getTrackAlbum(track: Track): string {
  return track.tags.album ?? "";
}

function getTrackTitle(track: Track): string {
  return track.tags.title ?? track.path;
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
