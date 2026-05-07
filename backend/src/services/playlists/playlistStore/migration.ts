import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import { usersStorageRoot } from "../../../utils/paths";
import {
  PLAYLISTS_DIRECTORY_NAME,
  PLAYLIST_METADATA_FILE,
  UPLOADS_DIRECTORY_NAME,
  getLegacyPlaylistDir,
  getPlaylistDir,
  getPlaylistsRoot,
  getUserRoot
} from "./paths";

async function pathExists(pathToCheck: string): Promise<boolean> {
  try {
    await fs.access(pathToCheck);
    return true;
  } catch {
    return false;
  }
}

export async function migrateLegacyPlaylistDir(authorId: string, playlistSlug: string): Promise<void> {
  const legacyDir = getLegacyPlaylistDir(authorId, playlistSlug);
  const targetDir = getPlaylistDir(authorId, playlistSlug);

  if (await pathExists(targetDir)) {
    return;
  }

  if (!(await pathExists(path.join(legacyDir, PLAYLIST_METADATA_FILE)))) {
    return;
  }

  await fs.mkdir(getPlaylistsRoot(authorId), { recursive: true });
  await fs.rename(legacyDir, targetDir);
}

async function migrateLegacyPlaylistsForOwner(authorId: string): Promise<void> {
  const ownerRoot = getUserRoot(authorId);
  let entries: Dirent[] = [];

  try {
    entries = await fs.readdir(ownerRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      continue;
    }

    if (entry.name === UPLOADS_DIRECTORY_NAME || entry.name === PLAYLISTS_DIRECTORY_NAME) {
      continue;
    }

    await migrateLegacyPlaylistDir(authorId, entry.name);
  }
}

export async function migrateLegacyPlaylists(): Promise<void> {
  let ownerEntries: Dirent[] = [];

  try {
    ownerEntries = await fs.readdir(usersStorageRoot, { withFileTypes: true });
  } catch {
    return;
  }

  const ownerIds = ownerEntries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const ownerId of ownerIds) {
    await migrateLegacyPlaylistsForOwner(ownerId);
  }
}
