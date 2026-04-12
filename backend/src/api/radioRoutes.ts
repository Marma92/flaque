import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import type { IndexStore } from "../services/indexer/indexStore";
import { RadioService } from "../services/radio/radioService";
import { createLogger } from "../utils/logger";

const log = createLogger("radio");

export function createRadioRouter(indexStore: IndexStore): Router {
  const router = Router();
  const radioService = new RadioService(indexStore);

  router.post("/radio/create", requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = await radioService.createStation();
      log.info("Radio station created", { userId: _req.authUser?.id ?? "unknown" });
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
        log.info("Radio station rebuilt", { stationId, userId: req.authUser?.id ?? "unknown" });
        res.json(payload);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
