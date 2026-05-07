import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import type { Playlist, Track } from "../../../types/library";
import { usersStorageRoot } from "../../../utils/paths";
import { toDataRelativePath } from "../../storage/storageService";
import {
  createPlaylistId,
  getPlaylistDir,
  getPlaylistsRoot,
  parsePlaylistIdOrThrow
} from "./paths";
import { readPlaylistMetadata } from "./metadata";

async function listPlaylistDirectories(): Promise<string[]> {
  let ownerEntries: Dirent[] = [];

  try {
    ownerEntries = await fs.readdir(usersStorageRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const directories: string[] = [];

  const ownerIds = ownerEntries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const ownerId of ownerIds) {
    const ownerPlaylistsRoot = getPlaylistsRoot(ownerId);
    let entries: Dirent[] = [];

    try {
      entries = await fs.readdir(ownerPlaylistsRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue;
      }
      directories.push(createPlaylistId(ownerId, entry.name));
    }
  }

  return directories;
}

async function resolveSymlinkTargetRelativePath(linkPath: string): Promise<string | null> {
  try {
    const symlinkTarget = await fs.readlink(linkPath);
    const resolvedFromLink = path.resolve(path.dirname(linkPath), symlinkTarget);
    const absoluteTarget = await fs.realpath(resolvedFromLink).catch(() => resolvedFromLink);
    return toDataRelativePath(absoluteTarget);
  } catch {
    return null;
  }
}

async function readPlaylistTrackIds(
  playlistId: string,
  trackIdByRelativePath: Map<string, string>
): Promise<string[]> {
  const { authorId, slug } = parsePlaylistIdOrThrow(playlistId);
  const playlistDir = getPlaylistDir(authorId, slug);
  let entries: Dirent[] = [];

  try {
    entries = await fs.readdir(playlistDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const symlinkEntries = entries
    .filter((entry) => entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const trackIds: string[] = [];

  for (const symlinkName of symlinkEntries) {
    const relativePath = await resolveSymlinkTargetRelativePath(path.join(playlistDir, symlinkName));
    if (!relativePath) {
      continue;
    }

    const trackId = trackIdByRelativePath.get(relativePath);
    if (trackId) {
      trackIds.push(trackId);
    }
  }

  return trackIds;
}

export async function scanFilesystemPlaylists(tracks: Track[]): Promise<Playlist[]> {
  const directories = await listPlaylistDirectories();
  const trackIdByRelativePath = new Map<string, string>();

  for (const track of tracks) {
    trackIdByRelativePath.set(track.path, track.id);
  }

  const playlists: Playlist[] = [];

  for (const playlistId of directories) {
    const metadata = await readPlaylistMetadata(playlistId);
    if (!metadata) {
      continue;
    }

    const { authorId } = parsePlaylistIdOrThrow(playlistId);

    const trackIds = await readPlaylistTrackIds(playlistId, trackIdByRelativePath);
    playlists.push({
      id: playlistId,
      name: metadata.name,
      authorId,
      visibility: metadata.visibility,
      trackIds,
      description: metadata.description,
      cover: metadata.cover,
      hearts: metadata.hearts,
      heartCount: metadata.hearts.length,
      listenCount: metadata.listenCount,
      collaborators: metadata.collaborators
    });
  }

  return playlists;
}
