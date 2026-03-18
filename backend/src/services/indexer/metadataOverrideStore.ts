import { readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { metadataOverridesFilePath } from "../../utils/paths";

export type TrackMetadataOverride = {
  artist?: string;
  album?: string;
};

type TrackMetadataOverridesMap = Record<string, TrackMetadataOverride>;

function normalizeField(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOverride(override: unknown): TrackMetadataOverride | undefined {
  if (!override || typeof override !== "object") {
    return undefined;
  }

  const artist = normalizeField((override as { artist?: unknown }).artist);
  const album = normalizeField((override as { album?: unknown }).album);

  if (!artist && !album) {
    return undefined;
  }

  return {
    artist,
    album
  };
}

function normalizeOverrides(raw: unknown): TrackMetadataOverridesMap {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const normalized: TrackMetadataOverridesMap = {};

  for (const [trackId, override] of Object.entries(raw)) {
    const safeTrackId = trackId.trim();
    if (!safeTrackId) {
      continue;
    }

    const cleanOverride = normalizeOverride(override);
    if (!cleanOverride) {
      continue;
    }

    normalized[safeTrackId] = cleanOverride;
  }

  return normalized;
}

export async function readTrackMetadataOverrides(): Promise<TrackMetadataOverridesMap> {
  const raw = await readJsonFile<unknown>(metadataOverridesFilePath, {});
  return normalizeOverrides(raw);
}

export async function mergeTrackMetadataOverrides(
  patch: TrackMetadataOverridesMap
): Promise<TrackMetadataOverridesMap> {
  const current = await readTrackMetadataOverrides();
  let hasChanges = false;

  for (const [trackId, override] of Object.entries(patch)) {
    const safeTrackId = trackId.trim();
    if (!safeTrackId) {
      continue;
    }

    const cleanOverride = normalizeOverride(override);
    const existing = current[safeTrackId];

    if (!cleanOverride) {
      if (existing) {
        delete current[safeTrackId];
        hasChanges = true;
      }
      continue;
    }

    if (existing?.artist === cleanOverride.artist && existing?.album === cleanOverride.album) {
      continue;
    }

    current[safeTrackId] = cleanOverride;
    hasChanges = true;
  }

  if (hasChanges) {
    await writeJsonAtomic(metadataOverridesFilePath, current);
  }

  return current;
}

export async function pruneTrackMetadataOverrides(validTrackIds: string[]): Promise<void> {
  const current = await readTrackMetadataOverrides();
  const keep = new Set(validTrackIds);
  let hasChanges = false;

  for (const trackId of Object.keys(current)) {
    if (keep.has(trackId)) {
      continue;
    }
    delete current[trackId];
    hasChanges = true;
  }

  if (hasChanges) {
    await writeJsonAtomic(metadataOverridesFilePath, current);
  }
}
