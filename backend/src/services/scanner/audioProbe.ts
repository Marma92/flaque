import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parseFile, type IAudioMetadata, type IPicture } from "music-metadata";

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
  tags: {
    title?: string;
    artist?: string;
    album?: string;
  };
  cover?: {
    data: Buffer;
    format?: string;
  };
};

function toNumber(value?: number | string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
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
  let parsedMetadata: IAudioMetadata | undefined;

  try {
    parsedMetadata = await parseFile(filePath, {
      duration: true,
      skipCovers: false
    });
  } catch {
    parsedMetadata = undefined;
  }

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
    tags: {
      title: parsedMetadata?.common.title,
      artist: parsedMetadata?.common.artist,
      album: parsedMetadata?.common.album
    },
    cover: firstPicture
      ? {
          data: firstPicture.data,
          format: firstPicture.format
        }
      : undefined
  };
}
