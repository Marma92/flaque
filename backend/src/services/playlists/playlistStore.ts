import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import type { AuthUser } from "../../types/auth";
import type { Playlist, PlaylistVisibility, Track } from "../../types/library";
import { usersStorageRoot } from "../../utils/paths";
import { writeJsonAtomic } from "../../utils/fs";
import { resolveTrackAbsolutePath, toDataRelativePath } from "../storage/storageService";

const PLAYLIST_METADATA_FILE = "playlist.json";
const UPLOADS_DIRECTORY_NAME = "uploads";
const PLAYLISTS_DIRECTORY_NAME = "playlists";

type PlaylistMetadata = {
  name: string;
  visibility: PlaylistVisibility;
  description: string;
  cover: string | null;
  hearts: string[];
  listenCount: number;
  collaborators: string[];
};

type CreatePlaylistInput = {
  name: string;
  authorId: string;
  visibility: PlaylistVisibility;
  trackIds: string[];
  tracksById: Map<string, Track>;
  description?: string;
};

type UpdatePlaylistInput = {
  id: string;
  name: string;
  visibility: PlaylistVisibility;
  trackIds: string[];
  tracksById: Map<string, Track>;
  collaborators?: string[];
};

function normalizeVisibility(value: unknown): PlaylistVisibility | null {
  if (value === "public" || value === "private") {
    return value;
  }
  return null;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function getPlaylistSlugOrThrow(name: string): string {
  const slug = slugify(name);
  if (slug.length < 2) {
    throw new Error("Playlist name must contain at least 2 alphanumeric characters");
  }
  return slug;
}

function createPlaylistId(authorId: string, slug: string): string {
  return `${authorId}:${slug}`;
}

function parsePlaylistIdOrThrow(playlistId: string): { authorId: string; slug: string } {
  const separatorIndex = playlistId.indexOf(":");
  if (separatorIndex < 1 || separatorIndex >= playlistId.length - 1) {
    throw new Error("Invalid playlist id");
  }

  return {
    authorId: playlistId.slice(0, separatorIndex),
    slug: playlistId.slice(separatorIndex + 1)
  };
}

function getUserRoot(authorId: string): string {
  return path.join(usersStorageRoot, authorId);
}

function getPlaylistsRoot(authorId: string): string {
  return path.join(getUserRoot(authorId), PLAYLISTS_DIRECTORY_NAME);
}

function getLegacyPlaylistDir(authorId: string, playlistSlug: string): string {
  return path.join(getUserRoot(authorId), playlistSlug);
}

function getPlaylistDir(authorId: string, playlistSlug: string): string {
  return path.join(getPlaylistsRoot(authorId), playlistSlug);
}

function getPlaylistMetadataPath(authorId: string, playlistSlug: string): string {
  return path.join(getPlaylistDir(authorId, playlistSlug), PLAYLIST_METADATA_FILE);
}

function canViewPlaylist(playlist: Playlist, user: AuthUser): boolean {
  return playlist.visibility === "public" || playlist.authorId === user.id || user.role === "admin";
}

async function pathExists(pathToCheck: string): Promise<boolean> {
  try {
    await fs.access(pathToCheck);
    return true;
  } catch {
    return false;
  }
}

async function migrateLegacyPlaylistDir(authorId: string, playlistSlug: string): Promise<void> {
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

export function canManagePlaylist(playlist: Playlist, user: AuthUser): boolean {
  return playlist.authorId === user.id || user.role === "admin";
}

export function canEditPlaylistTracks(playlist: Playlist, user: AuthUser): boolean {
  return canManagePlaylist(playlist, user) || playlist.collaborators.includes(user.id);
}

export function filterPlayablePlaylists(playlists: Playlist[], user: AuthUser): Playlist[] {
  return playlists.filter((playlist) => canViewPlaylist(playlist, user));
}

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

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

async function readPlaylistMetadata(playlistId: string): Promise<PlaylistMetadata | null> {
  const { authorId, slug } = parsePlaylistIdOrThrow(playlistId);
  const filePath = getPlaylistMetadataPath(authorId, slug);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const visibility = normalizeVisibility(parsed.visibility);
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    if (!name || !visibility) {
      return null;
    }
    return {
      name,
      visibility,
      description: typeof parsed.description === "string" ? parsed.description : "",
      cover: typeof parsed.cover === "string" && parsed.cover.trim() ? parsed.cover.trim() : null,
      hearts: normalizeStringArray(parsed.hearts),
      listenCount: typeof parsed.listenCount === "number" && Number.isFinite(parsed.listenCount)
        ? Math.max(0, Math.floor(parsed.listenCount))
        : 0,
      collaborators: normalizeStringArray(parsed.collaborators)
    };
  } catch {
    return null;
  }
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

function sanitizeLinkName(index: number, track: Track): string {
  const extension = path.extname(track.path) || ".audio";
  const safeTrackId = track.id.replace(/[^a-zA-Z0-9-_]/g, "_");
  const prefix = String(index + 1).padStart(4, "0");
  return `${prefix}-${safeTrackId}${extension}`;
}

async function clearPlaylistSymlinks(playlistDir: string): Promise<void> {
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(playlistDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isSymbolicLink()) {
      continue;
    }
    await fs.unlink(path.join(playlistDir, entry.name)).catch(() => undefined);
  }
}

function collectTracksOrThrow(trackIds: string[], tracksById: Map<string, Track>): Track[] {
  const tracks: Track[] = [];
  for (const trackId of trackIds) {
    const track = tracksById.get(trackId);
    if (!track) {
      throw new Error(`Unknown track id: ${trackId}`);
    }
    tracks.push(track);
  }
  return tracks;
}

async function writePlaylistContents(input: {
  authorId: string;
  playlistSlug: string;
  name: string;
  visibility: PlaylistVisibility;
  trackIds: string[];
  tracksById: Map<string, Track>;
  description?: string;
  cover?: string | null;
  hearts?: string[];
  listenCount?: number;
  collaborators?: string[];
}): Promise<void> {
  const playlistDir = getPlaylistDir(input.authorId, input.playlistSlug);
  await fs.mkdir(playlistDir, { recursive: true });
  await clearPlaylistSymlinks(playlistDir);

  const tracks = collectTracksOrThrow(input.trackIds, input.tracksById);
  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    if (!track) {
      continue;
    }
    const trackAbsolutePath = resolveTrackAbsolutePath(track.path);
    const linkName = sanitizeLinkName(index, track);
    const linkPath = path.join(playlistDir, linkName);
    const relativeTarget = path.relative(playlistDir, trackAbsolutePath);
    await fs.symlink(relativeTarget, linkPath);
  }

  await writeJsonAtomic(getPlaylistMetadataPath(input.authorId, input.playlistSlug), {
    name: input.name,
    visibility: input.visibility,
    description: input.description ?? "",
    cover: input.cover ?? null,
    hearts: input.hearts ?? [],
    listenCount: input.listenCount ?? 0,
    collaborators: input.collaborators ?? []
  } satisfies PlaylistMetadata);
}

export async function createFilesystemPlaylist(input: CreatePlaylistInput): Promise<string> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Playlist name is required");
  }

  const playlistSlug = getPlaylistSlugOrThrow(name);
  await migrateLegacyPlaylistDir(input.authorId, playlistSlug);
  const playlistDir = getPlaylistDir(input.authorId, playlistSlug);

  try {
    await fs.access(playlistDir);
    throw new Error("Playlist already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await writePlaylistContents({
    authorId: input.authorId,
    playlistSlug,
    name,
    visibility: input.visibility,
    trackIds: input.trackIds,
    tracksById: input.tracksById,
    description: input.description
  });

  return createPlaylistId(input.authorId, playlistSlug);
}

export async function updateFilesystemPlaylist(input: UpdatePlaylistInput & { authorId: string }): Promise<void> {
  const parsed = parsePlaylistIdOrThrow(input.id);
  if (parsed.authorId !== input.authorId) {
    throw new Error("Playlist author mismatch");
  }

  const nextName = input.name.trim();
  if (!nextName) {
    throw new Error("Playlist name is required");
  }

  const nextSlug = getPlaylistSlugOrThrow(nextName);
  await migrateLegacyPlaylistDir(parsed.authorId, parsed.slug);
  await migrateLegacyPlaylistDir(parsed.authorId, nextSlug);
  const currentDir = getPlaylistDir(parsed.authorId, parsed.slug);
  const nextDir = getPlaylistDir(parsed.authorId, nextSlug);

  if (parsed.slug !== nextSlug) {
    try {
      await fs.access(nextDir);
      throw new Error("Playlist already exists");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    await fs.rename(currentDir, nextDir);
  }

  const existingMetadata = await readPlaylistMetadata(input.id);

  await writePlaylistContents({
    authorId: input.authorId,
    playlistSlug: nextSlug,
    name: nextName,
    visibility: input.visibility,
    trackIds: input.trackIds,
    tracksById: input.tracksById,
    description: existingMetadata?.description,
    cover: existingMetadata?.cover,
    hearts: existingMetadata?.hearts,
    listenCount: existingMetadata?.listenCount,
    collaborators: input.collaborators ?? existingMetadata?.collaborators
  });
}

export async function deleteFilesystemPlaylist(playlistId: string): Promise<void> {
  const { authorId, slug } = parsePlaylistIdOrThrow(playlistId);
  await fs.rm(getPlaylistDir(authorId, slug), { recursive: true, force: true });
  await fs.rm(getLegacyPlaylistDir(authorId, slug), { recursive: true, force: true });
}

async function patchPlaylistMetadataFile(
  playlistId: string,
  updater: (metadata: PlaylistMetadata) => PlaylistMetadata
): Promise<PlaylistMetadata> {
  const metadata = await readPlaylistMetadata(playlistId);
  if (!metadata) {
    throw new Error("Playlist metadata not found");
  }

  const updated = updater(metadata);
  const { authorId, slug } = parsePlaylistIdOrThrow(playlistId);
  await writeJsonAtomic(getPlaylistMetadataPath(authorId, slug), updated);
  return updated;
}

export async function togglePlaylistHeart(
  playlistId: string,
  userId: string
): Promise<{ hearted: boolean; heartCount: number }> {
  const updated = await patchPlaylistMetadataFile(playlistId, (metadata) => {
    const hearts = metadata.hearts.filter((id) => id !== userId);
    const wasHearted = hearts.length < metadata.hearts.length;
    if (!wasHearted) {
      hearts.push(userId);
    }
    return { ...metadata, hearts };
  });

  return {
    hearted: updated.hearts.includes(userId),
    heartCount: updated.hearts.length
  };
}

export async function incrementPlaylistListenCount(playlistId: string): Promise<number> {
  const updated = await patchPlaylistMetadataFile(playlistId, (metadata) => ({
    ...metadata,
    listenCount: metadata.listenCount + 1
  }));
  return updated.listenCount;
}

export async function updatePlaylistDescription(
  playlistId: string,
  description: string
): Promise<void> {
  await patchPlaylistMetadataFile(playlistId, (metadata) => ({
    ...metadata,
    description
  }));
}

export async function updatePlaylistCover(
  playlistId: string,
  coverPath: string | null
): Promise<void> {
  await patchPlaylistMetadataFile(playlistId, (metadata) => ({
    ...metadata,
    cover: coverPath
  }));
}

export function getPlaylistDirectory(playlistId: string): string {
  const { authorId, slug } = parsePlaylistIdOrThrow(playlistId);
  return getPlaylistDir(authorId, slug);
}
