import type { Track, TrackTagExtraValue } from "../types";

const LEADING_THE_PATTERN = /^the\s+/i;

export function getArtistSortKey(value?: string): string {
  const trimmed = (value ?? "").trim();
  return trimmed.replace(LEADING_THE_PATTERN, "");
}

export function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const name = normalized.split("/").filter(Boolean).pop();
  return name ?? filePath;
}

export function getTrackDisplayTitle(track: Pick<Track, "path" | "tags">): string {
  const title = track.tags.title?.trim();
  if (title) {
    return title;
  }

  return "Unknown Track";
}

function normalizeTagText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function extractYearFromDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/(?:^|\D)(\d{4})(?:\D|$)/);
  return match?.[1];
}

const SYNCED_LYRICS_PREFIX = "SYNCED:";

export type SyncedLyricsLine = {
  t: number;
  text: string;
};

export function parseSyncedLyrics(raw: string): SyncedLyricsLine[] | null {
  if (!raw.startsWith(SYNCED_LYRICS_PREFIX)) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.slice(SYNCED_LYRICS_PREFIX.length)) as SyncedLyricsLine[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // not valid synced lyrics
  }

  return null;
}

export function getTrackSyncedLyrics(track: Pick<Track, "tags">): SyncedLyricsLine[] | null {
  const raw = extractRawLyricsFromExtra(track.tags.extra);
  if (!raw) return null;
  return parseSyncedLyrics(raw);
}

function extractRawLyricsFromExtra(extra: Record<string, TrackTagExtraValue> | undefined): string | undefined {
  if (!extra) return undefined;

  for (const [key, rawValue] of Object.entries(extra)) {
    const normalizedKey = key.toLowerCase();
    if (
      (normalizedKey.includes("lyric") && !normalizedKey.includes("lyricist")) ||
      normalizedKey === "uslt" ||
      normalizedKey === "lyrics"
    ) {
      if (typeof rawValue === "string" && rawValue) return rawValue;
    }
  }

  return undefined;
}

function normalizeLyricsText(value: string): string | undefined {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized ? normalized : undefined;
}

function extractLyricsFromExtraValue(value: TrackTagExtraValue | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    const synced = parseSyncedLyrics(value);
    if (synced) {
      const text = synced.map((line) => line.text).join("\n");
      return text || undefined;
    }
    return normalizeLyricsText(value);
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const joined = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .join("\n");

  return joined ? normalizeLyricsText(joined) : undefined;
}

function extractLyricsFromExtra(extra: Record<string, TrackTagExtraValue> | undefined): string | undefined {
  if (!extra) {
    return undefined;
  }

  for (const [key, rawValue] of Object.entries(extra)) {
    const normalizedKey = key.toLowerCase();
    const looksLikeLyricsKey =
      (normalizedKey.includes("lyric") && !normalizedKey.includes("lyricist")) ||
      normalizedKey === "uslt" ||
      normalizedKey === "lyrics";

    if (!looksLikeLyricsKey) {
      continue;
    }

    const lyrics = extractLyricsFromExtraValue(rawValue);
    if (lyrics) {
      return lyrics;
    }
  }

  return undefined;
}

export function getTrackDisplayArtist(track: Pick<Track, "tags">): string | undefined {
  const directArtist = normalizeTagText(track.tags.artist);
  if (directArtist) {
    return directArtist;
  }

  const albumArtist = normalizeTagText(track.tags.albumArtist);
  if (albumArtist) {
    return albumArtist;
  }

  if (Array.isArray(track.tags.artists)) {
    const firstArtist = track.tags.artists
      .map((artist) => normalizeTagText(artist))
      .find((artist): artist is string => Boolean(artist));

    if (firstArtist) {
      return firstArtist;
    }
  }

  return undefined;
}

export function getTrackDisplayAlbum(track: Pick<Track, "tags">): string | undefined {
  return normalizeTagText(track.tags.album);
}

export function getTrackDisplayYear(track: Pick<Track, "tags">): string | undefined {
  if (typeof track.tags.year === "number" && Number.isFinite(track.tags.year)) {
    return String(Math.trunc(track.tags.year));
  }

  return extractYearFromDate(track.tags.date) ?? extractYearFromDate(track.tags.originalDate);
}

export function getTrackDisplayAlbumWithYear(track: Pick<Track, "tags">): string | undefined {
  const album = getTrackDisplayAlbum(track);
  if (!album) {
    return undefined;
  }

  const year = getTrackDisplayYear(track);
  return year ? `${album} (${year})` : album;
}

export function getTrackDisplayLyrics(track: Pick<Track, "tags">): string | undefined {
  const extraLyrics = extractLyricsFromExtra(track.tags.extra);
  if (extraLyrics) {
    return extraLyrics;
  }

  if (!Array.isArray(track.tags.comment)) {
    return undefined;
  }

  const commentLyricsCandidate = track.tags.comment
    .map((entry) => normalizeLyricsText(entry))
    .find((entry): entry is string => Boolean(entry && entry.includes("\n")));

  return commentLyricsCandidate;
}
