import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { findCoverFileByTrackId } from "../services/storage/coverService";

export function createCoverRouter(): Router {
  const router = Router();

  router.get("/covers/:id", requireAuth, async (req, res, next) => {
    try {
      const trackId = req.params.id;
      if (!trackId) {
        res.status(400).json({ error: "Track id is required" });
        return;
      }

      const coverPath = await findCoverFileByTrackId(trackId);
      if (!coverPath) {
        res.status(404).json({ error: "Cover not found" });
        return;
      }

      res.setHeader("Cache-Control", "private, max-age=86400");
      res.sendFile(coverPath);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
