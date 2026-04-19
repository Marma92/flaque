import fs from "node:fs/promises";

import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { IndexStore } from "../services/indexer/indexStore";
import { resolveTrackAbsolutePath } from "../services/storage/storageService";
import { streamAudioWithRange } from "../services/streaming/streamService";
import {
  parseTranscodeFormat,
  streamTranscodedAudio,
  type TranscodeFormat
} from "../services/streaming/transcodeService";
import { AppError } from "../utils/AppError";
import { createLogger } from "../utils/logger";

const log = createLogger("streaming");

function isFlacTrack(track: { codec: string; mimeType: string; path: string }): boolean {
  return (
    track.mimeType.toLowerCase() === "audio/flac" ||
    track.codec.toLowerCase() === "flac" ||
    track.path.toLowerCase().endsWith(".flac")
  );
}

function transcodeErrorMessage(format: TranscodeFormat): string {
  if (format === "opus") {
    return "Opus fallback transcoding currently supports FLAC source files only";
  }
  return "MP3 fallback transcoding currently supports FLAC source files only";
}

export function createStreamingRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.get("/tracks/:id/stream", requireAuth, async (req, res, next) => {
    try {
      const trackId = req.params.id;
      if (!trackId) {
        return next(new AppError("Track id is required", 400));
      }

      const track = indexStore.getTrackById(trackId);
      if (!track) {
        return next(new AppError("Track not found", 404));
      }

      const transcode = parseTranscodeFormat(req.query.transcode);
      if (transcode === null) {
        return next(new AppError("transcode must be one of: opus, mp3 (or omitted for source stream)", 400));
      }

      const absolutePath = resolveTrackAbsolutePath(track.path);
      await fs.access(absolutePath);

      log.debug("Stream started", {
        trackId,
        title: track.tags.title ?? track.path,
        userId: req.authUser?.id ?? "unknown",
        transcode: transcode ?? "source"
      });

      if (transcode) {
        if (!isFlacTrack(track)) {
          return next(new AppError(transcodeErrorMessage(transcode), 400));
        }

        await streamTranscodedAudio(req, res, absolutePath, transcode);
        return;
      }

      await streamAudioWithRange(req, res, absolutePath, track.mimeType);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
