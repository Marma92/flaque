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
        res.status(400).json({ error: "Track id is required" });
        return;
      }

      const track = indexStore.getTrackById(trackId);
      if (!track) {
        res.status(404).json({ error: "Track not found" });
        return;
      }

      const transcode = parseTranscodeFormat(req.query.transcode);
      if (transcode === null) {
        res
          .status(400)
          .json({ error: "transcode must be one of: opus, mp3 (or omitted for source stream)" });
        return;
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
          res.status(400).json({ error: transcodeErrorMessage(transcode) });
          return;
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
