import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { IAudioMetadata, IPicture } from "music-metadata";

import type { TrackTagExtraValue, TrackTags } from "../../types/library";

const execFileAsync = promisify(execFile);

type FfprobeJson = {
  streams?: Array<{
    codec_name?: string;
    sample_rate?: string;
    bit_rate?: string;
    codec_type?: string;
  }>;
  format?: {
    duration?: string;
    bit_rate?: string;
  };
};

export type ExtractedAudioMetadata = {
  duration: number;
  codec: string;
  bitrate?: number;
  sampleRate?: number;
  tags: TrackTags;
  cover?: {
    data: Buffer;
    format?: string;
  };
};

type ParseFileFunction = (
  filePath: string,
  options?: {
    duration?: boolean;
    skipCovers?: boolean;
  }
) => Promise<IAudioMetadata>;

type MusicMetadataModule = {
  parseFile?: ParseFileFunction;
  loadMusicMetadata?: () => Promise<{
    parseFile?: ParseFileFunction;
  }>;
};

let parseFileLoaderPromise: Promise<ParseFileFunction | null> | null = null;

function toNumber(value?: number | string | null): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

function toInteger(value?: number | string | null): number | undefined {
  const parsed = toNumber(value);
  if (parsed === undefined) {
    return undefined;
  }

  return Math.trunc(parsed);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalizeString(item))
      .filter((item): item is string => Boolean(item));

    if (normalized.length === 0) {
      return undefined;
    }

    return Array.from(new Set(normalized));
  }

  const single = normalizeString(value);
  return single ? [single] : undefined;
}

function normalizeExtraPrimitive(
  value: unknown
): string | number | boolean | undefined {
  if (typeof value === "string") {
    return normalizeString(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function normalizeExtraValue(value: unknown): TrackTagExtraValue | undefined {
  const primitive = normalizeExtraPrimitive(value);
  if (primitive !== undefined) {
    return primitive;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((item) => normalizeExtraPrimitive(item))
    .filter((item): item is string | number | boolean => item !== undefined);

  return normalized.length > 0 ? normalized : undefined;
}

function extractYearFromDate(date?: string): number | undefined {
  if (!date) {
    return undefined;
  }

  const match = date.match(/(?:^|\D)(\d{4})(?:\D|$)/);
  if (!match || !match[1]) {
    return undefined;
  }

  const year = Number(match[1]);
  if (!Number.isInteger(year) || year < 1000 || year > 2999) {
    return undefined;
  }

  return year;
}

function normalizeTrackTags(parsedMetadata?: IAudioMetadata): TrackTags {
  if (!parsedMetadata?.common) {
    return {};
  }

  const common = parsedMetadata.common;
  const artists = normalizeStringArray(common.artists);
  const albumArtist = normalizeString(common.albumartist);
  const artist =
    normalizeString(common.artist) ?? artists?.[0] ?? albumArtist;
  const date = normalizeString(common.date);
  const originalDate = normalizeString(common.originaldate);
  const year = toInteger(common.year) ?? extractYearFromDate(date) ?? extractYearFromDate(originalDate);

  const trackNumber = toInteger(common.track.no);
  const trackTotal = toInteger(common.track.of);
  const discNumber = toInteger(common.disk.no);
  const discTotal = toInteger(common.disk.of);

  const tags: TrackTags = {
    title: normalizeString(common.title),
    artist,
    artists,
    album: normalizeString(common.album),
    albumArtist,
    year,
    date,
    originalDate,
    genre: normalizeStringArray(common.genre),
    trackNumber,
    trackTotal,
    discNumber,
    discTotal,
    composer: normalizeStringArray(common.composer),
    lyricist: normalizeStringArray(common.lyricist),
    comment: normalizeStringArray(common.comment),
    bpm: toInteger(common.bpm),
    isrc: normalizeStringArray(common.isrc),
    label: normalizeStringArray(common.label),
    copyright: normalizeString(common.copyright),
    language: normalizeString(common.language),
    encodedBy: normalizeString(common.encodedby)
  };

  const knownCommonKeys = new Set<string>([
    "title",
    "artist",
    "artists",
    "album",
    "albumartist",
    "year",
    "date",
    "originaldate",
    "genre",
    "track",
    "disk",
    "composer",
    "lyricist",
    "comment",
    "bpm",
    "isrc",
    "label",
    "copyright",
    "language",
    "encodedby",
    "picture",
    "lyrics"
  ]);

  const extra: Record<string, TrackTagExtraValue> = {};

  if (Array.isArray(common.lyrics)) {
    type SyncTextEntry = { timestamp?: number; text?: string };
    type LyricsEntry = { text?: string; syncText?: SyncTextEntry[] };

    let extracted = false;

    for (const entry of common.lyrics as LyricsEntry[]) {
      if (extracted) break;

      if (Array.isArray(entry.syncText) && entry.syncText.length > 0) {
        const lines = entry.syncText
          .filter((s: SyncTextEntry) => typeof s.text === "string" && s.text.trim() && typeof s.timestamp === "number")
          .map((s: SyncTextEntry) => ({ t: Math.round(s.timestamp! / 1000 * 100) / 100, text: s.text!.trim() }));

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
  for (const [key, value] of Object.entries(common as unknown as Record<string, unknown>)) {
    if (knownCommonKeys.has(key)) {
      continue;
    }

    const normalized = normalizeExtraValue(value);
    if (normalized === undefined) {
      continue;
    }

    extra[key] = normalized;
  }

  if (Object.keys(extra).length > 0) {
    tags.extra = extra;
  }

  return tags;
}

async function loadParseFileFunction(): Promise<ParseFileFunction | null> {
  if (parseFileLoaderPromise) {
    return parseFileLoaderPromise;
  }

  parseFileLoaderPromise = (async () => {
    try {
      const musicMetadata = (await import("music-metadata")) as MusicMetadataModule;

      if (typeof musicMetadata.parseFile === "function") {
        return musicMetadata.parseFile.bind(musicMetadata);
      }

      if (typeof musicMetadata.loadMusicMetadata === "function") {
        const loadedModule = await musicMetadata.loadMusicMetadata();
        if (typeof loadedModule.parseFile === "function") {
          return loadedModule.parseFile.bind(loadedModule);
        }
      }

      return null;
    } catch {
      return null;
    }
  })();

  return parseFileLoaderPromise;
}

async function parseWithMusicMetadata(filePath: string): Promise<IAudioMetadata | undefined> {
  const parseFile = await loadParseFileFunction();
  if (!parseFile) {
    return undefined;
  }

  try {
    return await parseFile(filePath, {
      duration: true,
      skipCovers: false
    });
  } catch {
    return undefined;
  }
}

async function probeWithFfprobe(filePath: string): Promise<{
  codec?: string;
  bitrate?: number;
  sampleRate?: number;
  duration?: number;
}> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", filePath],
      { timeout: 15_000 }
    );

    const parsed = JSON.parse(stdout) as FfprobeJson;
    const audioStream = parsed.streams?.find((stream) => stream.codec_type === "audio");

    return {
      codec: audioStream?.codec_name,
      sampleRate: toNumber(audioStream?.sample_rate),
      bitrate: toNumber(audioStream?.bit_rate) ?? toNumber(parsed.format?.bit_rate),
      duration: toNumber(parsed.format?.duration)
    };
  } catch {
    return {};
  }
}

function normalizePicture(picture?: IPicture): { data: Buffer; format?: string } | undefined {
  if (!picture) {
    return undefined;
  }

  return {
    data: Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data),
    format: picture.format
  };
}

export async function extractAudioMetadata(filePath: string): Promise<ExtractedAudioMetadata> {
  const parsedMetadata = await parseWithMusicMetadata(filePath);

  const ffprobeData = await probeWithFfprobe(filePath);
  const firstPicture = normalizePicture(parsedMetadata?.common.picture?.[0]);

  return {
    duration: Math.max(
      0,
      toNumber(parsedMetadata?.format.duration) ?? toNumber(ffprobeData.duration) ?? 0
    ),
    codec: parsedMetadata?.format.codec ?? ffprobeData.codec ?? "unknown",
    bitrate: toNumber(parsedMetadata?.format.bitrate) ?? ffprobeData.bitrate,
    sampleRate: toNumber(parsedMetadata?.format.sampleRate) ?? ffprobeData.sampleRate,
    tags: normalizeTrackTags(parsedMetadata),
    cover: firstPicture
      ? {
          data: firstPicture.data,
          format: firstPicture.format
        }
      : undefined
  };
}
