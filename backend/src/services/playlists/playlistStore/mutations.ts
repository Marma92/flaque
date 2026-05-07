import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import type { PlaylistVisibility, Track } from "../../../types/library";
import { writeJsonAtomic } from "../../../utils/fs";
import { resolveTrackAbsolutePath } from "../../storage/storageService";
import { readPlaylistMetadata, type PlaylistMetadata } from "./metadata";
import { migrateLegacyPlaylistDir } from "./migration";
import {
  createPlaylistId,
  getLegacyPlaylistDir,
  getPlaylistDir,
  getPlaylistMetadataPath,
  getPlaylistSlugOrThrow,
  parsePlaylistIdOrThrow
} from "./paths";

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
  description?: string;
  collaborators?: string[];
};

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

  const existingMetadata = await readPlaylistMetadata(input.id);

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

  await writePlaylistContents({
    authorId: input.authorId,
    playlistSlug: nextSlug,
    name: nextName,
    visibility: input.visibility,
    trackIds: input.trackIds,
    tracksById: input.tracksById,
    description: input.description ?? existingMetadata?.description,
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
