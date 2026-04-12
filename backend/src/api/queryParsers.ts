import type {
  LibraryFilter,
  TrackSortBy,
  TrackSortDirection,
  AdjacentDirection
} from "../services/indexer/libraryQuery";

const SUPPORTED_TRACK_SORT_FIELDS = new Set<TrackSortBy>([
  "title",
  "artist",
  "album",
  "owner",
  "duration",
  "codec",
  "bitrate",
  "sampleRate",
  "path",
  "addedAt"
]);

const DEFAULT_TRACKS_PAGE = 1;
const DEFAULT_TRACKS_LIMIT = 100;
const MAX_TRACKS_LIMIT = 500;

export function normalizeQueryValue(value: unknown): string | undefined {
  const firstValue = Array.isArray(value) ? value[0] : value;
  if (typeof firstValue !== "string") {
    return undefined;
  }

  const trimmed = firstValue.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  bounds?: { min?: number; max?: number }
): number | null {
  const normalized = normalizeQueryValue(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  if (bounds?.min !== undefined && parsed < bounds.min) {
    return null;
  }

  if (bounds?.max !== undefined && parsed > bounds.max) {
    return null;
  }

  return parsed;
}

function parseTrackSortBy(value: unknown): TrackSortBy | null | undefined {
  const normalized = normalizeQueryValue(value);
  if (!normalized) {
    return undefined;
  }

  if (SUPPORTED_TRACK_SORT_FIELDS.has(normalized as TrackSortBy)) {
    return normalized as TrackSortBy;
  }

  return null;
}

function parseTrackSortDirection(value: unknown): TrackSortDirection | null {
  const normalized = normalizeQueryValue(value);
  if (!normalized) {
    return "asc";
  }

  if (normalized === "asc" || normalized === "desc") {
    return normalized;
  }

  return null;
}

export function readFilter(query: Record<string, unknown>): LibraryFilter {
  return {
    owner: normalizeQueryValue(query.owner),
    artist: normalizeQueryValue(query.artist),
    album: normalizeQueryValue(query.album),
    q: normalizeQueryValue(query.q)
  };
}

export type TracksQuery = {
  page: number;
  limit: number;
  sortBy?: TrackSortBy;
  sortDir: TrackSortDirection;
  filter: LibraryFilter;
  addedAfter?: string;
};

export function readTracksQuery(query: Record<string, unknown>):
  | TracksQuery
  | { error: string } {
  const page = parsePositiveInteger(query.page, DEFAULT_TRACKS_PAGE, { min: 1 });
  if (page === null) {
    return { error: "page must be an integer >= 1" };
  }

  const limit = parsePositiveInteger(query.limit, DEFAULT_TRACKS_LIMIT, {
    min: 1,
    max: MAX_TRACKS_LIMIT
  });
  if (limit === null) {
    return { error: `limit must be an integer between 1 and ${MAX_TRACKS_LIMIT}` };
  }

  const sortBy = parseTrackSortBy(query.sortBy);
  if (sortBy === null) {
    return {
      error:
        "sortBy must be one of: title, artist, album, owner, duration, codec, bitrate, sampleRate, path, addedAt"
    };
  }

  const sortDir = parseTrackSortDirection(query.sortDir);
  if (!sortDir) {
    return { error: "sortDir must be asc or desc" };
  }

  let addedAfter: string | undefined;
  const addedAfterRaw = normalizeQueryValue(query.addedAfter);
  if (addedAfterRaw) {
    const parsed = Date.parse(addedAfterRaw);
    if (Number.isNaN(parsed)) {
      return { error: "addedAfter must be a valid ISO 8601 date string" };
    }
    addedAfter = new Date(parsed).toISOString();
  }

  return { page, limit, sortBy, sortDir, filter: readFilter(query), addedAfter };
}

export function readDirection(value: unknown): AdjacentDirection | null {
  const normalized = normalizeQueryValue(value);
  if (!normalized) {
    return "next";
  }

  if (normalized === "next" || normalized === "previous") {
    return normalized;
  }

  return null;
}

export function readWrap(value: unknown): boolean {
  const normalized = normalizeQueryValue(value);
  if (!normalized) {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return true;
}

export function hasOwnProperty(value: unknown, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key);
}

export function parseMetadataField(value: unknown): string | undefined | null {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function parseMetadataYearField(value: unknown): number | undefined | null {
  if (value === null || value === undefined) {
    return undefined;
  }

  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1000 || n > 2999) {
    return null;
  }

  return n;
}
