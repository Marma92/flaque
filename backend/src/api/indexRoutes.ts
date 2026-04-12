import { Router } from "express";

import { requireAdmin, requireAuth } from "../auth/middleware";
import { IndexStore } from "../services/indexer/indexStore";
import { createLogger } from "../utils/logger";

const log = createLogger("index");

export function createIndexRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.post("/index/rebuild", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const startedAt = Date.now();
      const index = await indexStore.rebuild();
      const durationMs = Date.now() - startedAt;

      log.info("Index rebuild triggered", {
        userId: _req.authUser?.id ?? "unknown",
        totalTracks: index.totalTracks,
        durationMs
      });

      res.json({
        generatedAt: index.generatedAt,
        totalTracks: index.totalTracks,
        durationMs
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
