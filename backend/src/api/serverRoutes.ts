import { Router } from "express";

import { requireAdmin, requireAuth } from "../auth/middleware";
import { getVersionCheckResult, forceVersionCheck } from "../services/versionCheck";
import { AppError } from "../utils/AppError";
import { createLogger } from "../utils/logger";

const log = createLogger("server");

export function createServerRouter(): Router {
  const router = Router();

  router.get("/server/version", requireAuth, requireAdmin, (_req, res) => {
    res.json(getVersionCheckResult());
  });

  router.post("/server/version/check", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const result = await forceVersionCheck();
      log.info("Version check triggered", { userId: _req.authUser?.id ?? "unknown" });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/server/update", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const secret = process.env.UPDATE_SECRET;
      if (!secret) {
        return next(new AppError("Self-update is not configured", 501, "selfUpdateConfigured"));
      }

      log.info("Server update initiated", { userId: _req.authUser?.id ?? "unknown" });

      const updaterUrl = process.env.UPDATER_URL ?? "http://updater:9090";

      const response = await fetch(`${updaterUrl}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
        signal: AbortSignal.timeout(10_000)
      });

      const body = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        log.warn("Server update request failed", { status: response.status, userId: _req.authUser?.id ?? "unknown" });
        res.status(response.status).json(body);
        return;
      }

      res.status(202).json(body);
    } catch (error) {
      next(error);
    }
  });

  router.get("/server/update/status", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const updaterUrl = process.env.UPDATER_URL ?? "http://updater:9090";

      const response = await fetch(`${updaterUrl}/status`, {
        signal: AbortSignal.timeout(5_000)
      });

      const body = await response.json() as Record<string, unknown>;
      res.json(body);
    } catch {
      res.json({ status: "unavailable" });
    }
  });

  return router;
}
