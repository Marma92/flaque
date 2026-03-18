import fs from "node:fs/promises";

import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { IndexStore } from "../services/indexer/indexStore";
import { resolveTrackAbsolutePath } from "../services/storage/storageService";
import { streamAudioWithRange } from "../services/streaming/streamService";

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

      const absolutePath = resolveTrackAbsolutePath(track.path);
      await fs.access(absolutePath);
      await streamAudioWithRange(req, res, absolutePath, track.mimeType);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
