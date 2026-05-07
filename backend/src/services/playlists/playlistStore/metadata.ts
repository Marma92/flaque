import fs from "node:fs/promises";

import type { PlaylistVisibility } from "../../../types/library";
import { withFileLock, writeJsonAtomic } from "../../../utils/fs";
import { getPlaylistMetadataPath, parsePlaylistIdOrThrow } from "./paths";

export type PlaylistMetadata = {
  name: string;
  visibility: PlaylistVisibility;
  description: string;
  cover: string | null;
  hearts: string[];
  listenCount: number;
  collaborators: string[];
};

export function normalizeVisibility(value: unknown): PlaylistVisibility | null {
  if (value === "public" || value === "private") {
    return value;
  }
  return null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function readPlaylistMetadata(playlistId: string): Promise<PlaylistMetadata | null> {
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

export async function patchPlaylistMetadataFile(
  playlistId: string,
  updater: (metadata: PlaylistMetadata) => PlaylistMetadata
): Promise<PlaylistMetadata> {
  const { authorId, slug } = parsePlaylistIdOrThrow(playlistId);
  const metadataFilePath = getPlaylistMetadataPath(authorId, slug);

  return withFileLock(metadataFilePath, async () => {
    const metadata = await readPlaylistMetadata(playlistId);
    if (!metadata) {
      throw new Error("Playlist metadata not found");
    }
    const updated = updater(metadata);
    await writeJsonAtomic(metadataFilePath, updated);
    return updated;
  });
}
