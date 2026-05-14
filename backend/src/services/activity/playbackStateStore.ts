import path from "node:path";

import { readJsonFile, updateJsonFile } from "../../utils/fs";
import { usersStorageRoot } from "../../utils/paths";

export type PlaybackState = {
  trackId: string;
  positionSec: number;
  updatedAt: string;
};

type PlaybackStateFile = {
  state: PlaybackState | null;
};

function playbackStatePath(userId: string): string {
  return path.join(usersStorageRoot, userId, "playback-state.json");
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
  input: { trackId: string; positionSec: number }
): Promise<PlaybackState> {
  const trackId = input.trackId.trim();
  const positionSec = Math.max(0, Number.isFinite(input.positionSec) ? input.positionSec : 0);
  const next: PlaybackState = {
    trackId,
    positionSec,
    updatedAt: new Date().toISOString()
  };

  await updateJsonFile<PlaybackStateFile>(
    playbackStatePath(userId),
    { state: null },
    () => ({ state: next })
  );

  return next;
}

export async function clearPlaybackState(userId: string): Promise<void> {
  await updateJsonFile<PlaybackStateFile>(
    playbackStatePath(userId),
    { state: null },
    () => ({ state: null })
  );
}
