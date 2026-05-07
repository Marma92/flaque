import { createLogger } from "../../../utils/logger";
import { readJsonFile, updateJsonFile } from "../../../utils/fs";
import { dismissedPath } from "./paths";

const log = createLogger("for-you-playlists");

const DISMISSAL_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 3 months

type DismissedEntry = {
  playlistId: string;
  dismissedAt: string;
};

type DismissedFile = {
  dismissed: DismissedEntry[];
};

async function readDismissals(userId: string): Promise<DismissedEntry[]> {
  const data = await readJsonFile<DismissedFile>(dismissedPath(userId), { dismissed: [] });
  if (!data || !Array.isArray(data.dismissed)) return [];
  return data.dismissed;
}

function getActiveDismissals(entries: DismissedEntry[]): Set<string> {
  const now = Date.now();
  const active = new Set<string>();
  for (const entry of entries) {
    const dismissedAt = new Date(entry.dismissedAt).getTime();
    if (!isNaN(dismissedAt) && now - dismissedAt < DISMISSAL_EXPIRY_MS) {
      active.add(entry.playlistId);
    }
  }
  return active;
}

export async function dismissForYouPlaylist(userId: string, playlistId: string): Promise<void> {
  await updateJsonFile<DismissedFile>(
    dismissedPath(userId),
    { dismissed: [] },
    (current) => {
      const entries = Array.isArray(current?.dismissed) ? [...current.dismissed] : [];
      const existing = entries.find((e) => e.playlistId === playlistId);
      if (existing) {
        existing.dismissedAt = new Date().toISOString();
      } else {
        entries.push({ playlistId, dismissedAt: new Date().toISOString() });
      }
      return { dismissed: entries };
    }
  );
  log.info(`User ${userId} dismissed for-you playlist ${playlistId}`);
}

export async function getUserDismissals(userId: string): Promise<Set<string>> {
  const entries = await readDismissals(userId);
  return getActiveDismissals(entries);
}
