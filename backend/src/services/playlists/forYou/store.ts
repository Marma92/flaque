import fs from "node:fs/promises";
import path from "node:path";

import { createLogger } from "../../../utils/logger";
import { ensureDir, readJsonFile, writeJsonAtomic } from "../../../utils/fs";
import { slugify, userForYouDir, userForYouMetaPath } from "./paths";

const log = createLogger("for-you-playlists");

export const REGENERATION_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

/** Stable identifier for the naming heuristic that produced the playlist name. */
export type ForYouNameVariant = "more" | "friends" | "decade" | "around" | "because";

export type ForYouPlaylist = {
  id: string;
  name: string;
  seedArtist: string;
  trackIds: string[];
  trackCount: number;
  generatedAt: string;
  /**
   * Structured name descriptor so the client can render the name in its own
   * language. `name` above stays the English fallback for old playlists that
   * predate these fields.
   */
  nameVariant?: ForYouNameVariant;
  nameDecadeLabel?: string;
  /**
   * Seed-artist score used to rank playlists "best-fit first" on Home.
   * Missing on playlists generated before this field was introduced — those
   * sink to the bottom on read.
   */
  score?: number;
};

type ForYouMeta = {
  lastGeneratedAt: string;
};

export async function saveForYouPlaylists(userId: string, playlists: ForYouPlaylist[]): Promise<void> {
  const dir = userForYouDir(userId);
  await ensureDir(dir);

  const existing = await fs.readdir(dir).catch(() => []);
  for (const file of existing) {
    if (file.endsWith(".json") && file !== "_meta.json" && file !== "_trace.json") {
      await fs.unlink(path.join(dir, file)).catch(() => {});
    }
  }

  for (const playlist of playlists) {
    const fileName = `${slugify(playlist.seedArtist)}.json`;
    await writeJsonAtomic(path.join(dir, fileName), playlist);
  }

  const meta: ForYouMeta = { lastGeneratedAt: new Date().toISOString() };
  await writeJsonAtomic(userForYouMetaPath(userId), meta);

  log.info(`Saved ${playlists.length} for-you playlist(s) for user ${userId}`);
}

export async function loadForYouPlaylists(userId: string): Promise<ForYouPlaylist[]> {
  const dir = userForYouDir(userId);
  await ensureDir(dir);

  const files = await fs.readdir(dir).catch(() => []);
  const playlists: ForYouPlaylist[] = [];

  for (const file of files) {
    if (!file.endsWith(".json") || file === "_meta.json" || file === "_trace.json") continue;
    const data = await readJsonFile<ForYouPlaylist>(
      path.join(dir, file),
      null as unknown as ForYouPlaylist
    );
    if (data && data.id && data.trackIds) {
      playlists.push(data);
    }
  }

  return playlists.sort((a, b) => {
    const scoreA = typeof a.score === "number" ? a.score : -Infinity;
    const scoreB = typeof b.score === "number" ? b.score : -Infinity;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.name.localeCompare(b.name);
  });
}

export async function getForYouPlaylistById(
  userId: string,
  playlistId: string
): Promise<ForYouPlaylist | null> {
  const all = await loadForYouPlaylists(userId);
  return all.find((p) => p.id === playlistId) ?? null;
}

export async function needsForYouRegeneration(userId: string): Promise<boolean> {
  const metaPath = userForYouMetaPath(userId);
  const meta = await readJsonFile<ForYouMeta>(metaPath, { lastGeneratedAt: "" });
  if (!meta.lastGeneratedAt) return true;

  const lastGenerated = new Date(meta.lastGeneratedAt).getTime();
  if (isNaN(lastGenerated)) return true;

  return Date.now() - lastGenerated > REGENERATION_INTERVAL_MS;
}
