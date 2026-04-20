import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import { fileExists, readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { createTrackId } from "../../utils/hash";
import { isSupportedAudioFile } from "../../utils/mime";
import { UNKNOWN_ARTIST, UNKNOWN_ALBUM, ARTIST_METADATA_FILE, ALBUM_METADATA_FILE } from "../../utils/music";
import { sharedMusicRoot } from "../../utils/paths";
import { ensureDirectoryMetadata, normalizeDirectorySegment, writeEmbeddedCoverToDirectory } from "../media/mediaMetadataService";
import { extractAudioMetadata } from "./audioProbe";
import { toDataRelativePath } from "../storage/storageService";
import { type FileSystemTrackState, createTrackIdentity } from "./scannerState";

type AlbumMetadata = {
  name?: string;
  cover?: { path: string };
};

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
  const visitedDirs = new Set<string>();

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }

    // Resolve through symlinks so loops can't traverse forever.
    let realDir: string;
    try {
      realDir = await fs.realpath(current);
    } catch {
      continue;
    }

    if (visitedDirs.has(realDir)) {
      continue;
    }
    visitedDirs.add(realDir);

    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absoluteEntryPath = path.join(current, entry.name);

      let isDirectory = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          const resolved = await fs.stat(absoluteEntryPath);
          isDirectory = resolved.isDirectory();
          isFile = resolved.isFile();
        } catch {
          continue;
        }
      }

      if (isDirectory) {
        queue.push(absoluteEntryPath);
        continue;
      }

      if (isFile && isSupportedAudioFile(absoluteEntryPath)) {
        files.push(absoluteEntryPath);
      }
    }
  }

  return files;
}

export async function collectFilesystemState(
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
