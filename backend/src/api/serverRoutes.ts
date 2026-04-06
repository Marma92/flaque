import { Router } from "express";

import { requireAdmin, requireAuth } from "../auth/middleware";
import { getVersionCheckResult } from "../services/versionCheck";

export function createServerRouter(): Router {
  const router = Router();

  router.get("/server/version", requireAuth, requireAdmin, (_req, res) => {
    res.json(getVersionCheckResult());
  });

  router.post("/server/update", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const secret = process.env.UPDATE_SECRET;
      if (!secret) {
        res.status(501).json({ error: "Self-update is not configured" });
        return;
      }

      const updaterUrl = process.env.UPDATER_URL ?? "http://updater:9090";

      const response = await fetch(`${updaterUrl}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
        signal: AbortSignal.timeout(10_000)
      });

      const body = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        res.status(response.status).json(body);
        return;
      }

      res.status(202).json(body);
    } catch (error) {
      next(error);
    }
  });

  router.get("/server/update/status", requireAuth, requireAdmin, async (_req, res, next) => {
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
