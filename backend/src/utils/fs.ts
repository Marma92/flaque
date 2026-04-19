import fs from "node:fs/promises";
import path from "node:path";

import {
  backupsRoot,
  cacheRoot,
  configRoot,
  coversRoot,
  indexFilePath,
  metadataOverridesFilePath,
  indexRoot,
  logsRoot,
  sharedMusicRoot,
  storageRoot,
  tmpUploadsRoot,
  transcodesRoot,
  usersStorageRoot
} from "./paths";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function moveFile(sourcePath: string, destinationPath: string): Promise<void> {
  try {
    await fs.rename(sourcePath, destinationPath);
    return;
  } catch (error) {
    const exdevError = error as NodeJS.ErrnoException;
    if (exdevError?.code !== "EXDEV") {
      throw error;
    }
  }

  await fs.copyFile(sourcePath, destinationPath);
  await fs.unlink(sourcePath);
}

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(tmpPath, payload, "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const fileLocks = new Map<string, Promise<unknown>>();

/**
 * Serializes async work on a file path within this process. Prevents concurrent
 * read-modify-write races on JSON stores (play counts, ownership, playlist
 * metadata, etc.) while the app is still using flat files.
 *
 * In-process only — a single-process Node server is assumed. Multi-process
 * deployments would need OS-level locking (e.g. proper-lockfile).
 */
export async function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const key = path.resolve(filePath);
  const previous = fileLocks.get(key) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  fileLocks.set(key, next);
  try {
    return await next;
  } finally {
    if (fileLocks.get(key) === next) {
      fileLocks.delete(key);
    }
  }
}

/**
 * Reads a JSON file, applies the updater, and writes the result atomically —
 * all under a per-path lock. Skips the write if the updater returns
 * `undefined`, letting callers abort mutations when no changes are needed.
 */
export async function updateJsonFile<T>(
  filePath: string,
  fallback: T,
  updater: (current: T) => T | undefined | Promise<T | undefined>
): Promise<T> {
  return withFileLock(filePath, async () => {
    const current = await readJsonFile<T>(filePath, fallback);
    const next = await updater(current);
    if (next === undefined) {
      return current;
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await writeJsonAtomic(filePath, next);
    return next;
  });
}

export async function ensureBaseDirectories(): Promise<void> {
  await Promise.all([
    ensureDir(configRoot),
    ensureDir(storageRoot),
    ensureDir(usersStorageRoot),
    ensureDir(sharedMusicRoot),
    ensureDir(cacheRoot),
    ensureDir(coversRoot),
    ensureDir(transcodesRoot),
    ensureDir(tmpUploadsRoot),
    ensureDir(indexRoot),
    ensureDir(logsRoot),
    ensureDir(backupsRoot)
  ]);

  const hasIndex = await fileExists(indexFilePath);
  if (!hasIndex) {
    await writeJsonAtomic(indexFilePath, {
      generatedAt: "",
      totalTracks: 0,
      tracks: [],
      playlists: []
    });
  }

  const hasOverrides = await fileExists(metadataOverridesFilePath);
  if (!hasOverrides) {
    await writeJsonAtomic(metadataOverridesFilePath, {});
  }
}
