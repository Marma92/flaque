import path from "node:path";

import { readJsonFile, updateJsonFile } from "../../utils/fs";
import { usersStorageRoot } from "../../utils/paths";

type TrackSkip = {
  count: number;
  lastSkippedAt: string;
};

type SkipsFile = {
  tracks: Record<string, TrackSkip>;
};

function skipsPath(userId: string): string {
  return path.join(usersStorageRoot, userId, "skips.json");
}

async function readSkips(userId: string): Promise<SkipsFile> {
  const filePath = skipsPath(userId);
  const data = await readJsonFile<SkipsFile>(filePath, { tracks: {} });
  if (!data || typeof data !== "object" || !data.tracks) {
    return { tracks: {} };
  }
  return data;
}

export async function recordSkip(userId: string, trackId: string): Promise<void> {
  await updateJsonFile<SkipsFile>(
    skipsPath(userId),
    { tracks: {} },
    (current) => {
      const tracks = current?.tracks && typeof current.tracks === "object" ? { ...current.tracks } : {};
      const existing = tracks[trackId];
      tracks[trackId] = {
        count: (existing?.count ?? 0) + 1,
        lastSkippedAt: new Date().toISOString()
      };
      return { tracks };
    }
  );
}

export async function getUserSkipCounts(userId: string): Promise<Record<string, TrackSkip>> {
  const data = await readSkips(userId);
  return data.tracks;
}

export type RecentSkipEntry = {
  count: number;
  lastSkippedAt: string;
};

export async function getRecentSkipCounts(
  userId: string,
  withinDays: number
): Promise<Record<string, RecentSkipEntry>> {
  const all = await getUserSkipCounts(userId);
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  const out: Record<string, RecentSkipEntry> = {};
  for (const [trackId, entry] of Object.entries(all)) {
    const ts = Date.parse(entry.lastSkippedAt);
    if (Number.isFinite(ts) && ts >= cutoff) {
      out[trackId] = { count: entry.count, lastSkippedAt: entry.lastSkippedAt };
    }
  }
  return out;
}
