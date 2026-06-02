import path from "node:path";

import { readJsonFile, updateJsonFile } from "../../utils/fs";
import { usersStorageRoot } from "../../utils/paths";

export type PlaybackState = {
  trackId: string;
  positionSec: number;
  updatedAt: string;
  /** Ordered track IDs of the queue that was playing, so a resume can continue past the current track. */
  queue?: string[];
};

type PlaybackStateFile = {
  state: PlaybackState | null;
};

function playbackStatePath(userId: string): string {
  return path.join(usersStorageRoot, userId, "playback-state.json");
}

function sanitizeQueue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return ids;
}

function isValidState(value: unknown): value is PlaybackState {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.trackId === "string" &&
    typeof record.positionSec === "number" &&
    Number.isFinite(record.positionSec) &&
    typeof record.updatedAt === "string"
  );
}

export async function getPlaybackState(userId: string): Promise<PlaybackState | null> {
  const data = await readJsonFile<PlaybackStateFile>(playbackStatePath(userId), { state: null });
  if (!data || !isValidState(data.state)) {
    return null;
  }
  return data.state;
}

export async function setPlaybackState(
  userId: string,
  input: { trackId: string; positionSec: number; queue?: string[] }
): Promise<PlaybackState> {
  const trackId = input.trackId.trim();
  const positionSec = Math.max(0, Number.isFinite(input.positionSec) ? input.positionSec : 0);
  // An explicit (even empty) queue replaces the stored one; omitting it preserves
  // the existing queue so frequent position-only updates don't drop it.
  const incomingQueue = sanitizeQueue(input.queue);

  const result = await updateJsonFile<PlaybackStateFile>(
    playbackStatePath(userId),
    { state: null },
    (current) => {
      const existingQueue = isValidState(current.state) ? current.state.queue : undefined;
      const queue = incomingQueue ?? existingQueue;
      const next: PlaybackState = {
        trackId,
        positionSec,
        updatedAt: new Date().toISOString(),
        ...(queue && queue.length > 0 ? { queue } : {})
      };
      return { state: next };
    }
  );

  return result.state ?? {
    trackId,
    positionSec,
    updatedAt: new Date().toISOString()
  };
}

export async function clearPlaybackState(userId: string): Promise<void> {
  await updateJsonFile<PlaybackStateFile>(
    playbackStatePath(userId),
    { state: null },
    () => ({ state: null })
  );
}
