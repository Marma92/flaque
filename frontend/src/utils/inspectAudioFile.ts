import { parseBlob, type IAudioMetadata, type IPicture } from "music-metadata";

import type { TrackTags, TrackTagExtraValue } from "../types";
import type { UploadTrackPreview } from "../api";

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  ".flac": "audio/flac",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".m4a": "audio/mp4"
};

const SUPPORTED_EXTENSIONS = new Set(Object.keys(AUDIO_MIME_BY_EXT));

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function toNumber(value?: number | string | null): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toInteger(value?: number | string | null): number | undefined {
  const n = toNumber(value);
  return n === undefined ? undefined : Math.trunc(n);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value
      .map((v) => normalizeString(v))
      .filter((v): v is string => Boolean(v));
    return items.length > 0 ? Array.from(new Set(items)) : undefined;
  }
  const single = normalizeString(value);
  return single ? [single] : undefined;
}

function normalizeExtraPrimitive(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string") return normalizeString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "boolean") return value;
  return undefined;
}

function normalizeExtraValue(value: unknown): TrackTagExtraValue | undefined {
  const primitive = normalizeExtraPrimitive(value);
  if (primitive !== undefined) return primitive;
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((v) => normalizeExtraPrimitive(v))
    .filter((v): v is string | number | boolean => v !== undefined);
  return items.length > 0 ? items : undefined;
}

function extractYearFromDate(date?: string): number | undefined {
  if (!date) return undefined;
  const match = date.match(/(?:^|\D)(\d{4})(?:\D|$)/);
  if (!match?.[1]) return undefined;
  const year = Number(match[1]);
  return Number.isInteger(year) && year >= 1000 && year <= 2999 ? year : undefined;
}

const KNOWN_COMMON_KEYS = new Set([
  "title", "artist", "artists", "album", "albumartist", "year", "date",
  "originaldate", "genre", "track", "disk", "composer", "lyricist",
  "comment", "bpm", "isrc", "label", "copyright", "language", "encodedby",
  "picture", "lyrics"
]);

function normalizeTrackTags(meta?: IAudioMetadata): TrackTags {
  if (!meta?.common) return {};

  const c = meta.common;
  const artists = normalizeStringArray(c.artists);
  const albumArtist = normalizeString(c.albumartist);
  const artist = normalizeString(c.artist) ?? artists?.[0] ?? albumArtist;
  const date = normalizeString(c.date);
  const originalDate = normalizeString(c.originaldate);
  const year = toInteger(c.year) ?? extractYearFromDate(date) ?? extractYearFromDate(originalDate);

  const tags: TrackTags = {
    title: normalizeString(c.title),
    artist,
    artists,
    album: normalizeString(c.album),
    albumArtist,
    year,
    date,
    originalDate,
    genre: normalizeStringArray(c.genre),
    trackNumber: toInteger(c.track.no),
    trackTotal: toInteger(c.track.of),
    discNumber: toInteger(c.disk.no),
    discTotal: toInteger(c.disk.of),
    composer: normalizeStringArray(c.composer),
    lyricist: normalizeStringArray(c.lyricist),
    comment: normalizeStringArray(c.comment),
    bpm: toInteger(c.bpm),
    isrc: normalizeStringArray(c.isrc),
    label: normalizeStringArray(c.label),
    copyright: normalizeString(c.copyright),
    language: normalizeString(c.language),
    encodedBy: normalizeString(c.encodedby)
  };

  const extra: Record<string, TrackTagExtraValue> = {};

  type SyncTextEntry = { timestamp?: number; text?: string };
  type LyricsEntry = { text?: string; syncText?: SyncTextEntry[] };

  if (Array.isArray(c.lyrics)) {
    let extracted = false;
    for (const entry of c.lyrics as LyricsEntry[]) {
      if (extracted) break;
      if (Array.isArray(entry.syncText) && entry.syncText.length > 0) {
        const lines = entry.syncText
          .filter((s) => typeof s.text === "string" && s.text.trim() && typeof s.timestamp === "number")
          .map((s) => ({ t: Math.round((s.timestamp! / 1000) * 100) / 100, text: s.text!.trim() }));
        if (lines.length > 0) {
          extra.lyrics = "SYNCED:" + JSON.stringify(lines);
          extracted = true;
        }
      }
      if (!extracted && typeof entry.text === "string" && entry.text.trim()) {
        extra.lyrics = entry.text.trim();
        extracted = true;
      }
    }
  }

  for (const [key, value] of Object.entries(c as unknown as Record<string, unknown>)) {
    if (KNOWN_COMMON_KEYS.has(key)) continue;
    const normalized = normalizeExtraValue(value);
    if (normalized !== undefined) extra[key] = normalized;
  }

  if (Object.keys(extra).length > 0) tags.extra = extra;
  return tags;
}

function pictureToDataUrl(picture?: IPicture): string | undefined {
  if (!picture?.data || picture.data.length === 0) return undefined;
  const mime = picture.format || "image/jpeg";
  const bytes = picture.data instanceof Uint8Array ? picture.data : new Uint8Array(picture.data);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

export async function inspectAudioFile(file: File): Promise<UploadTrackPreview> {
  const ext = extOf(file.name);
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported audio format: ${file.name}`);
  }

  const meta = await parseBlob(file, { duration: true });
  const cover = meta.common.picture?.[0];

  return {
    fileName: file.name,
    size: file.size,
    mimeType: AUDIO_MIME_BY_EXT[ext] ?? "application/octet-stream",
    duration: Math.max(0, toNumber(meta.format.duration) ?? 0),
    codec: meta.format.codec ?? "unknown",
    bitrate: toNumber(meta.format.bitrate),
    sampleRate: toNumber(meta.format.sampleRate),
    tags: normalizeTrackTags(meta),
    coverDataUrl: pictureToDataUrl(cover)
  };
}
