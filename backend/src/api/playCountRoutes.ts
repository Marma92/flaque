import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import type { IndexStore } from "../services/indexer/indexStore";
import { incrementPlayCount, getUserPlayStats } from "../services/activity/playCountStore";
import { createLogger } from "../utils/logger";

const log = createLogger("play-counts");

export function createPlayCountRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.post("/tracks/:id/play", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const trackId = req.params.id;
      if (!trackId) {
        res.status(400).json({ error: "Track id is required" });
        return;
      }

      if (!indexStore.hasTrack(trackId)) {
        res.status(404).json({ error: "Track not found" });
        return;
      }

      await incrementPlayCount(userId, trackId);
      log.debug("Play recorded", { userId, trackId });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/me/play-stats", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const stats = await getUserPlayStats(userId, indexStore);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
