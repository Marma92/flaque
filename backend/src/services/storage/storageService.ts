import fs from "node:fs/promises";
import path from "node:path";

import { ensureDir } from "../../utils/fs";
import { dataRoot, getOwnerUploadsDir, toPosixPath, usersStorageRoot } from "../../utils/paths";

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
