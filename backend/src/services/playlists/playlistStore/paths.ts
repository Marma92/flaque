import path from "node:path";

import { usersStorageRoot } from "../../../utils/paths";

export const PLAYLIST_METADATA_FILE = "playlist.json";
export const UPLOADS_DIRECTORY_NAME = "uploads";
export const PLAYLISTS_DIRECTORY_NAME = "playlists";

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function getPlaylistSlugOrThrow(name: string): string {
  const slug = slugify(name);
  if (slug.length < 2) {
    throw new Error("Playlist name must contain at least 2 alphanumeric characters");
  }
  return slug;
}

export function createPlaylistId(authorId: string, slug: string): string {
  return `${authorId}:${slug}`;
}

export function parsePlaylistIdOrThrow(playlistId: string): { authorId: string; slug: string } {
  const separatorIndex = playlistId.indexOf(":");
  if (separatorIndex < 1 || separatorIndex >= playlistId.length - 1) {
    throw new Error("Invalid playlist id");
  }

  return {
    authorId: playlistId.slice(0, separatorIndex),
    slug: playlistId.slice(separatorIndex + 1)
  };
}

export function getUserRoot(authorId: string): string {
  return path.join(usersStorageRoot, authorId);
}

export function getPlaylistsRoot(authorId: string): string {
  return path.join(getUserRoot(authorId), PLAYLISTS_DIRECTORY_NAME);
}

export function getLegacyPlaylistDir(authorId: string, playlistSlug: string): string {
  return path.join(getUserRoot(authorId), playlistSlug);
}

export function getPlaylistDir(authorId: string, playlistSlug: string): string {
  return path.join(getPlaylistsRoot(authorId), playlistSlug);
}

export function getPlaylistMetadataPath(authorId: string, playlistSlug: string): string {
  return path.join(getPlaylistDir(authorId, playlistSlug), PLAYLIST_METADATA_FILE);
}

export function getPlaylistDirectory(playlistId: string): string {
  const { authorId, slug } = parsePlaylistIdOrThrow(playlistId);
  return getPlaylistDir(authorId, slug);
}
