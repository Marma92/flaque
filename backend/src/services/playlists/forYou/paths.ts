import path from "node:path";

import { dataRoot, usersStorageRoot } from "../../../utils/paths";

export const FOR_YOU_DIR = path.join(dataRoot, "auto-playlists", "for-you");

export function userForYouDir(userId: string): string {
  return path.join(FOR_YOU_DIR, userId);
}

export function userForYouMetaPath(userId: string): string {
  return path.join(userForYouDir(userId), "_meta.json");
}

export function userForYouTracePath(userId: string): string {
  return path.join(userForYouDir(userId), "_trace.json");
}

export function dismissedPath(userId: string): string {
  return path.join(usersStorageRoot, userId, "dismissed-playlists.json");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
