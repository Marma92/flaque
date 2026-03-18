import { readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { trackActivityLogFilePath } from "../../utils/paths";

const DEFAULT_MAX_TRACK_ACTIVITY_EVENTS = 20_000;

export type TrackActivityEvent = {
  type: "uploaded" | "deleted";
  trackId: string;
  ownerId: string;
  path: string;
  at: string;
  byUserId?: string;
  byUsername?: string;
};

let appendQueue: Promise<void> = Promise.resolve();

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseMaxEvents(): number {
  const parsed = Number(process.env.TRACK_ACTIVITY_MAX_EVENTS ?? DEFAULT_MAX_TRACK_ACTIVITY_EVENTS);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_MAX_TRACK_ACTIVITY_EVENTS;
  }
  return parsed;
}

function normalizeEvent(candidate: unknown): TrackActivityEvent | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const parsed = candidate as Record<string, unknown>;
  const type = parsed.type;
  const trackId = toNonEmptyString(parsed.trackId);
  const ownerId = toNonEmptyString(parsed.ownerId);
  const trackPath = toNonEmptyString(parsed.path);
  const at = toNonEmptyString(parsed.at);

  if ((type !== "uploaded" && type !== "deleted") || !trackId || !ownerId || !trackPath || !at) {
    return null;
  }

  return {
    type,
    trackId,
    ownerId,
    path: trackPath,
    at,
    byUserId: toNonEmptyString(parsed.byUserId),
    byUsername: toNonEmptyString(parsed.byUsername)
  };
}

export async function readTrackActivityEvents(): Promise<TrackActivityEvent[]> {
  const raw = await readJsonFile<unknown>(trackActivityLogFilePath, []);
  if (!Array.isArray(raw)) {
    return [];
  }

  const events: TrackActivityEvent[] = [];
  for (const item of raw) {
    const normalized = normalizeEvent(item);
    if (normalized) {
      events.push(normalized);
    }
  }

  return events;
}

export async function appendTrackActivityEvents(events: TrackActivityEvent[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const normalizedEvents = events.map(normalizeEvent).filter((event): event is TrackActivityEvent => Boolean(event));
  if (normalizedEvents.length === 0) {
    return;
  }

  appendQueue = appendQueue.then(async () => {
    const existing = await readTrackActivityEvents();
    const maxEvents = parseMaxEvents();
    const merged = [...existing, ...normalizedEvents];
    const sliced = merged.length > maxEvents ? merged.slice(merged.length - maxEvents) : merged;
    await writeJsonAtomic(trackActivityLogFilePath, sliced);
  });

  await appendQueue;
}

export async function readLatestTrackUploadsByTrackId(): Promise<Map<string, string>> {
  const events = await readTrackActivityEvents();
  const uploadMap = new Map<string, string>();

  for (const event of events) {
    if (event.type !== "uploaded") {
      continue;
    }
    uploadMap.set(event.trackId, event.at);
  }

  return uploadMap;
}
