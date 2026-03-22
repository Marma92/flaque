import path from "node:path";

const backendRoot = path.resolve(__dirname, "..", "..");
const workspaceRoot = path.resolve(backendRoot, "..");

export const dataRoot = process.env.DATA_ROOT
  ? path.resolve(process.env.DATA_ROOT)
  : path.join(workspaceRoot, "data");

export const configRoot = path.join(dataRoot, "config");
export const storageRoot = path.join(dataRoot, "storage");
export const usersStorageRoot = path.join(storageRoot, "users");
export const sharedMusicRoot = path.join(storageRoot, "music");
export const cacheRoot = path.join(dataRoot, "cache");
export const coversRoot = path.join(cacheRoot, "covers");
export const transcodesRoot = path.join(cacheRoot, "transcodes");
export const tmpUploadsRoot = path.join(cacheRoot, "tmp-uploads");
export const indexRoot = path.join(dataRoot, "index");
export const indexFilePath = path.join(indexRoot, "library-index.json");
export const scannerStateFilePath = path.join(indexRoot, "scanner-state.json");
export const playlistsIndexFilePath = path.join(indexRoot, "playlists-index.json");
export const metadataOverridesFilePath = path.join(indexRoot, "track-metadata-overrides.json");
export const trackActivityLogFilePath = path.join(indexRoot, "track-activity-log.json");
export const usersDbPath = path.join(configRoot, "users.db");

export function getOwnerUploadsDir(ownerId: string): string {
  return path.join(usersStorageRoot, ownerId, "uploads");
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function resolveDataRelativePath(relativePath: string): string {
  const normalized = path.normalize(relativePath);
  const resolved = path.resolve(dataRoot, normalized);
  const rootWithSlash = `${dataRoot}${path.sep}`;
  if (resolved !== dataRoot && !resolved.startsWith(rootWithSlash)) {
    throw new Error("Invalid relative data path");
  }
  return resolved;
}
