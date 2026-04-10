import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import type { IndexStore } from "../services/indexer/indexStore";
import { RadioService } from "../services/radio/radioService";

export function createRadioRouter(indexStore: IndexStore): Router {
  const router = Router();
  const radioService = new RadioService(indexStore);

  router.post("/radio/create", requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await radioService.createStation();
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get("/radio/state", requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await radioService.getState();
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.get("/radio/queue", requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await radioService.getQueue();
      res.json(payload);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/radio/rebuild/:stationId",
    requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const stationId = req.params.stationId;
        if (!stationId) {
          res.status(400).json({
            serverNow: new Date().toISOString(),
            success: false,
            message: "stationId is required",
            station: null
          });
          return;
        }

        const payload = await radioService.rebuildStation(stationId);
        res.json(payload);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
