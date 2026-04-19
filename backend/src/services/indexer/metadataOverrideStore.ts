import { readJsonFile, updateJsonFile } from "../../utils/fs";
import { metadataOverridesFilePath } from "../../utils/paths";

export type TrackMetadataOverride = {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  genre?: string[];
};

type TrackMetadataOverridesMap = Record<string, TrackMetadataOverride>;

function normalizeField(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeYear(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1000 || n > 2999) return undefined;
  return n;
}

function normalizeGenre(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;

  const genres: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed) genres.push(trimmed);
  }

  return genres.length > 0 ? genres : undefined;
}

function normalizeOverride(override: unknown): TrackMetadataOverride | undefined {
  if (!override || typeof override !== "object") {
    return undefined;
  }

  const record = override as Record<string, unknown>;
  const artist = normalizeField(record.artist);
  const album = normalizeField(record.album);
  const title = normalizeField(record.title);
  const year = normalizeYear(record.year);
  const genre = normalizeGenre(record.genre);

  if (!title && !artist && !album && year === undefined && !genre) {
    return undefined;
  }

  return {
    title,
    artist,
    album,
    year,
    genre
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
  return updateJsonFile<TrackMetadataOverridesMap>(
    metadataOverridesFilePath,
    {},
    (raw) => {
      const current = normalizeOverrides(raw);
      let hasChanges = false;

      for (const [trackId, override] of Object.entries(patch)) {
        const safeTrackId = trackId.trim();
        if (!safeTrackId) continue;

        const cleanOverride = normalizeOverride(override);
        const existing = current[safeTrackId];

        if (!cleanOverride) {
          if (existing) {
            delete current[safeTrackId];
            hasChanges = true;
          }
          continue;
        }

        if (
          existing?.title === cleanOverride.title &&
          existing?.artist === cleanOverride.artist &&
          existing?.album === cleanOverride.album &&
          existing?.year === cleanOverride.year &&
          JSON.stringify(existing?.genre) === JSON.stringify(cleanOverride.genre)
        ) {
          continue;
        }

        current[safeTrackId] = cleanOverride;
        hasChanges = true;
      }

      return hasChanges ? current : undefined;
    }
  );
}

export async function pruneTrackMetadataOverrides(validTrackIds: string[]): Promise<void> {
  const keep = new Set(validTrackIds);
  await updateJsonFile<TrackMetadataOverridesMap>(
    metadataOverridesFilePath,
    {},
    (raw) => {
      const current = normalizeOverrides(raw);
      let hasChanges = false;
      for (const trackId of Object.keys(current)) {
        if (!keep.has(trackId)) {
          delete current[trackId];
          hasChanges = true;
        }
      }
      return hasChanges ? current : undefined;
    }
  );
}
