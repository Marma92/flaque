import { Router } from "express";

import { requireAdmin, requireAuth } from "../../auth/middleware";
import {
  getLibrarySettings,
  updateLibrarySettings
} from "../../services/librarySettings/librarySettings";
import { createLogger } from "../../utils/logger";

const log = createLogger("library-settings");

export function createLibrarySettingsRouter(): Router {
  const router = Router();

  router.get("/library/settings", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const settings = await getLibrarySettings();
      res.json(settings);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/library/settings", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      const patch: { aiRecommendation?: boolean } = {};
      if (typeof body.aiRecommendation === "boolean") {
        patch.aiRecommendation = body.aiRecommendation;
      }

      const updated = await updateLibrarySettings(patch);

      if (Object.keys(patch).length > 0) {
        log.info("Library settings updated", {
          userId: req.authUser?.id ?? "unknown",
          changes: patch
        });
      }

      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
