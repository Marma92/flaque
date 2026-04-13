import path from "node:path";

import { readJsonFile, writeJsonAtomic, ensureDir } from "../../utils/fs";
import { usersStorageRoot } from "../../utils/paths";
import type { IndexStore } from "../indexer/indexStore";
import { createLogger } from "../../utils/logger";

const log = createLogger("play-counts");

type TrackPlayCount = {
  count: number;
  lastPlayedAt: string;
};

type PlayCountsFile = {
  tracks: Record<string, TrackPlayCount>;
};

function playCountsPath(userId: string): string {
  return path.join(usersStorageRoot, userId, "play-counts.json");
}

async function readPlayCounts(userId: string): Promise<PlayCountsFile> {
  const filePath = playCountsPath(userId);
  const data = await readJsonFile<PlayCountsFile>(filePath, { tracks: {} });
  if (!data || typeof data !== "object" || !data.tracks) {
    return { tracks: {} };
  }
  return data;
}

async function writePlayCounts(userId: string, data: PlayCountsFile): Promise<void> {
  const filePath = playCountsPath(userId);
  await ensureDir(path.dirname(filePath));
  await writeJsonAtomic(filePath, data);
}

export async function incrementPlayCount(userId: string, trackId: string): Promise<void> {
  const data = await readPlayCounts(userId);
  const existing = data.tracks[trackId];
  data.tracks[trackId] = {
    count: (existing?.count ?? 0) + 1,
    lastPlayedAt: new Date().toISOString()
  };
  await writePlayCounts(userId, data);
}

export async function getUserPlayCounts(
  userId: string
): Promise<Record<string, TrackPlayCount>> {
  const data = await readPlayCounts(userId);
  return data.tracks;
}

export type TopTrackEntry = {
  trackId: string;
  count: number;
  lastPlayedAt: string;
};

export async function getUserTopTracks(
  userId: string,
  limit: number
): Promise<TopTrackEntry[]> {
  const counts = await getUserPlayCounts(userId);
  return Object.entries(counts)
    .map(([trackId, entry]) => ({ trackId, count: entry.count, lastPlayedAt: entry.lastPlayedAt }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type TopArtistEntry = {
  artist: string;
  playCount: number;
};

export async function getUserTopArtists(
  userId: string,
  limit: number,
  indexStore: IndexStore
): Promise<TopArtistEntry[]> {
  const counts = await getUserPlayCounts(userId);
  const artistPlayCounts = new Map<string, number>();

  for (const [trackId, entry] of Object.entries(counts)) {
    const track = indexStore.getTrackById(trackId);
    if (!track) continue;

    const artist = track.tags.artist ?? "Unknown";
    artistPlayCounts.set(artist, (artistPlayCounts.get(artist) ?? 0) + entry.count);
  }

  return Array.from(artistPlayCounts.entries())
    .map(([artist, playCount]) => ({ artist, playCount }))
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, limit);
}

export type PlayStatsResponse = {
  topTracks: TopTrackEntry[];
  topArtists: TopArtistEntry[];
  totalPlays: number;
  uniqueTracksPlayed: number;
};

export async function getUserPlayStats(
  userId: string,
  indexStore: IndexStore
): Promise<PlayStatsResponse> {
  const counts = await getUserPlayCounts(userId);
  const entries = Object.entries(counts);

  const totalPlays = entries.reduce((sum, [, entry]) => sum + entry.count, 0);

  const topTracks = entries
    .map(([trackId, entry]) => ({ trackId, count: entry.count, lastPlayedAt: entry.lastPlayedAt }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const topArtists = await getUserTopArtists(userId, 15, indexStore);

  return {
    topTracks,
    topArtists,
    totalPlays,
    uniqueTracksPlayed: entries.length
  };
}
