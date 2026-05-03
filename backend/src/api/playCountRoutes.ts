import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import type { IndexStore } from "../services/indexer/indexStore";
import { incrementPlayCount, getUserPlayStats } from "../services/activity/playCountStore";
import { recordSkip } from "../services/activity/skipStore";
import { AppError } from "../utils/AppError";
import { createLogger } from "../utils/logger";

const log = createLogger("play-counts");

export function createPlayCountRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.post("/tracks/:id/play", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        return next(new AppError("Authentication required", 401));
      }

      const trackId = req.params.id;
      if (!trackId) {
        return next(new AppError("Track id is required", 400));
      }

      if (!indexStore.hasTrack(trackId)) {
        return next(new AppError("Track not found", 404));
      }

      await incrementPlayCount(userId, trackId);
      log.debug("Play recorded", { userId, trackId });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.post("/tracks/:id/skip", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        return next(new AppError("Authentication required", 401));
      }

      const trackId = req.params.id;
      if (!trackId) {
        return next(new AppError("Track id is required", 400));
      }

      if (!indexStore.hasTrack(trackId)) {
        return next(new AppError("Track not found", 404));
      }

      await recordSkip(userId, trackId);
      log.debug("Skip recorded", { userId, trackId });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.get("/me/play-stats", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        return next(new AppError("Authentication required", 401));
      }

      const stats = await getUserPlayStats(userId, indexStore);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
