import { spawn } from "node:child_process";

import type { Request, Response } from "express";

export type TranscodeFormat = "opus" | "mp3";

const TRANSCODE_PROFILE: Record<
  TranscodeFormat,
  {
    codec: string;
    bitrate: string;
    ffmpegFormat: string;
    mimeType: string;
  }
> = {
  opus: {
    codec: "libopus",
    bitrate: "160k",
    ffmpegFormat: "ogg",
    mimeType: "audio/ogg"
  },
  mp3: {
    codec: "libmp3lame",
    bitrate: "320k",
    ffmpegFormat: "mp3",
    mimeType: "audio/mpeg"
  }
};

export function parseTranscodeFormat(value: unknown): TranscodeFormat | null | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return parseTranscodeFormat(value[0]);
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === "opus" || normalized === "mp3") {
    return normalized;
  }

  return null;
}

export async function streamTranscodedAudio(
  req: Request,
  res: Response,
  sourceFilePath: string,
  format: TranscodeFormat
): Promise<void> {
  const profile = TRANSCODE_PROFILE[format];
  const ffmpegArgs = [
    "-v",
    "error",
    "-i",
    sourceFilePath,
    "-vn",
    "-map",
    "0:a:0",
    "-c:a",
    profile.codec,
    "-b:a",
    profile.bitrate,
    "-f",
    profile.ffmpegFormat,
    "pipe:1"
  ];

  const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  ffmpeg.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
    if (stderr.length > 4096) {
      stderr = stderr.slice(-4096);
    }
  });

  res.status(200);
  res.setHeader("Content-Type", profile.mimeType);
  res.setHeader("Accept-Ranges", "none");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Flaque-Transcode", format);

  const cleanup = (): void => {
    if (!ffmpeg.killed) {
      ffmpeg.kill("SIGKILL");
    }
  };

  req.on("close", cleanup);
  res.on("close", cleanup);

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;

      req.off("close", cleanup);
      res.off("close", cleanup);

      if (error) {
        reject(error);
        return;
      }

      resolve();
    };

    ffmpeg.on("error", (error) => {
      finish(new Error(`Unable to start ffmpeg transcoding process: ${error.message}`));
    });

    ffmpeg.on("close", (code, signal) => {
      if (code === 0 || res.writableEnded || req.destroyed || signal === "SIGKILL") {
        finish();
        return;
      }

      finish(new Error(`ffmpeg transcoding failed with code ${code ?? "unknown"}: ${stderr.trim()}`));
    });

    ffmpeg.stdout.on("error", (error) => {
      finish(new Error(`Transcoded audio stream failed: ${error.message}`));
    });

    res.on("finish", () => {
      finish();
    });

    ffmpeg.stdout.pipe(res);
  });
}
