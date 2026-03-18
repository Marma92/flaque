import { Router } from "express";

import { requireAdmin, requireAuth } from "../auth/middleware";
import { IndexStore } from "../services/indexer/indexStore";

export function createIndexRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.post("/index/rebuild", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const startedAt = Date.now();
      const index = await indexStore.rebuild();
      res.json({
        generatedAt: index.generatedAt,
        totalTracks: index.totalTracks,
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
