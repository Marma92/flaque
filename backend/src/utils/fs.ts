import fs from "node:fs/promises";

import {
  cacheRoot,
  configRoot,
  coversRoot,
  indexFilePath,
  metadataOverridesFilePath,
  trackActivityLogFilePath,
  indexRoot,
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

export async function ensureBaseDirectories(): Promise<void> {
  await Promise.all([
    ensureDir(configRoot),
    ensureDir(storageRoot),
    ensureDir(usersStorageRoot),
    ensureDir(cacheRoot),
    ensureDir(coversRoot),
    ensureDir(transcodesRoot),
    ensureDir(tmpUploadsRoot),
    ensureDir(indexRoot)
  ]);

  const hasIndex = await fileExists(indexFilePath);
  if (!hasIndex) {
    await writeJsonAtomic(indexFilePath, {
      generatedAt: "",
      totalTracks: 0,
      tracks: []
    });
  }

  const hasOverrides = await fileExists(metadataOverridesFilePath);
  if (!hasOverrides) {
    await writeJsonAtomic(metadataOverridesFilePath, {});
  }

  const hasTrackActivityLog = await fileExists(trackActivityLogFilePath);
  if (!hasTrackActivityLog) {
    await writeJsonAtomic(trackActivityLogFilePath, []);
  }
}
