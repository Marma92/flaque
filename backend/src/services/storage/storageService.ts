import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import { ensureDir, fileExists, moveFile } from "../../utils/fs";
import { isSupportedAudioFile } from "../../utils/mime";
import { dataRoot, getOwnerUploadsDir, sharedMusicRoot, toPosixPath, usersStorageRoot } from "../../utils/paths";
import { registerTrackOwner } from "./ownershipStore";

export async function ensureSharedMusicDir(): Promise<string> {
  await ensureDir(sharedMusicRoot);
  return sharedMusicRoot;
}

export async function ensureOwnerUploadDir(ownerId: string): Promise<string> {
  const uploadDir = getOwnerUploadsDir(ownerId);
  await ensureDir(uploadDir);
  return uploadDir;
}

export async function listOwnerIds(): Promise<string[]> {
  try {
    const entries = await fs.readdir(usersStorageRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function toDataRelativePath(absolutePath: string): string {
  const relative = path.relative(dataRoot, absolutePath);
  return toPosixPath(relative);
}

export function resolveTrackAbsolutePath(relativePath: string): string {
  const resolved = path.resolve(dataRoot, relativePath);
  const rootPrefix = `${dataRoot}${path.sep}`;
  if (resolved !== dataRoot && !resolved.startsWith(rootPrefix)) {
    throw new Error("Track path escapes data root");
  }
  return resolved;
}

async function collectFilesRecursive(dir: string): Promise<string[]> {
  const files: string[] = [];
  let entries: Dirent[];

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      files.push(...(await collectFilesRecursive(fullPath)));
    } else if (entry.isFile() && !entry.isSymbolicLink()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function removeEmptyDirectories(dir: string, stopAt: string): Promise<void> {
  if (dir === stopAt || !dir.startsWith(stopAt)) {
    return;
  }

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  if (entries.length === 0) {
    await fs.rmdir(dir).catch(() => undefined);
    await removeEmptyDirectories(path.dirname(dir), stopAt);
  }
}

export async function migratePerUserUploadsToSharedMusic(): Promise<number> {
  let ownerEntries: Dirent[];

  try {
    ownerEntries = await fs.readdir(usersStorageRoot, { withFileTypes: true });
  } catch {
    return 0;
  }

  const ownerIds = ownerEntries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name);

  let migratedCount = 0;

  for (const ownerId of ownerIds) {
    const uploadsDir = getOwnerUploadsDir(ownerId);
    if (!(await fileExists(uploadsDir))) {
      continue;
    }

    const allFiles = await collectFilesRecursive(uploadsDir);

    for (const filePath of allFiles) {
      const subPath = path.relative(uploadsDir, filePath);
      const targetPath = path.join(sharedMusicRoot, subPath);

      if (await fileExists(targetPath)) {
        if (isSupportedAudioFile(filePath)) {
          await fs.unlink(filePath).catch(() => undefined);
        }
        continue;
      }

      await ensureDir(path.dirname(targetPath));
      await moveFile(filePath, targetPath);

      if (isSupportedAudioFile(filePath)) {
        const relativePath = toDataRelativePath(targetPath);
        await registerTrackOwner(relativePath, ownerId);
        migratedCount++;
      }
    }

    await removeEmptyDirectories(uploadsDir, usersStorageRoot);
  }

  return migratedCount;
}
