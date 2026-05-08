import { Router } from "express";

import { requireAdmin, requireAuth } from "../auth/middleware";
import type { IndexStore } from "../services/indexer/indexStore";
import {
  getEnrichmentStatus,
  reEnrichTrack,
  reapplySynonymsToOverrides,
  runBackgroundEnrichment,
  stopEnrichment
} from "../services/genre/genreEnrichmentService";
import {
  clearEnrichmentLog,
  readEnrichmentLog
} from "../services/genre/enrichmentLogStore";
import {
  getSynonyms,
  setSynonym,
  removeSynonym,
  resetSynonymsToDefaults
} from "../services/genre/genreSynonymService";
import { getGenreCacheStats, clearGenreCache } from "../services/genre/musicBrainzService";
import { AppError } from "../utils/AppError";
import { createLogger } from "../utils/logger";

const log = createLogger("genre-routes");

export function createGenreRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.get("/genre/enrichment/status", requireAuth, requireAdmin, (_req, res) => {
    res.json(getEnrichmentStatus());
  });

  router.post("/genre/enrichment/start", requireAuth, requireAdmin, (_req, res) => {
    const status = getEnrichmentStatus();
    if (status.running) {
      res.json({ started: false, message: "Enrichment already running", status });
      return;
    }

    void runBackgroundEnrichment(indexStore);

    log.info("Genre enrichment started", { userId: _req.authUser?.id ?? "unknown" });
    res.json({ started: true, message: "Genre enrichment started" });
  });

  router.post("/genre/enrichment/stop", requireAuth, requireAdmin, (_req, res) => {
    stopEnrichment();
    log.info("Genre enrichment stopped", { userId: _req.authUser?.id ?? "unknown" });
    res.json({ stopped: true });
  });

  router.get("/genre/enrichment/log", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 100;
      const entries = await readEnrichmentLog(limit);
      res.json({ entries });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/genre/enrichment/log", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      await clearEnrichmentLog();
      log.info("Enrichment log cleared", { userId: req.authUser?.id ?? "unknown" });
      res.json({ cleared: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/genre/enrichment/track/:trackId", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const trackId = req.params.trackId;
      if (!trackId) {
        return next(new AppError("Track id is required", 400));
      }
      const track = indexStore.getTrackById(trackId);
      if (!track) {
        return next(new AppError("Track not found", 404));
      }
      if (!track.tags.artist || !track.tags.title) {
        return next(new AppError("Track is missing artist or title; cannot re-enrich", 400));
      }

      log.info("Track re-enrichment requested", {
        trackId,
        title: track.tags.title,
        userId: req.authUser?.id ?? "unknown"
      });

      const result = await reEnrichTrack(track, indexStore);
      res.json({ trackId, result });
    } catch (error) {
      next(error);
    }
  });

  router.get("/genre/synonyms", requireAuth, requireAdmin, (_req, res) => {
    res.json(getSynonyms());
  });

  router.put("/genre/synonyms", requireAuth, requireAdmin, (req, res, next) => {
    const { from, to } = req.body as { from?: string; to?: string };
    if (typeof from !== "string" || !from.trim() || typeof to !== "string" || !to.trim()) {
      return next(new AppError("Both 'from' and 'to' must be non-empty strings", 400));
    }

    setSynonym(from, to);
    log.info("Genre synonym updated", { from, to, userId: req.authUser?.id ?? "unknown" });
    res.json({ from: from.trim().toLowerCase(), to: to.trim() });
  });

  router.delete("/genre/synonyms/:key", requireAuth, requireAdmin, (req, res, next) => {
    const key = req.params.key;
    if (!key) {
      return next(new AppError("Synonym key required", 400));
    }

    const removed = removeSynonym(key);
    if (!removed) {
      return next(new AppError("Synonym not found", 404));
    }

    log.info("Genre synonym removed", { key, userId: req.authUser?.id ?? "unknown" });
    res.json({ removed: true });
  });

  router.post("/genre/synonyms/reset", requireAuth, requireAdmin, (_req, res) => {
    resetSynonymsToDefaults();
    log.info("Genre synonyms reset to defaults", { userId: _req.authUser?.id ?? "unknown" });
    res.json({ reset: true });
  });

  router.post("/genre/synonyms/reapply", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const result = await reapplySynonymsToOverrides(indexStore);
      log.info("Genre synonyms reapplied to library", {
        scanned: result.scanned,
        updated: result.updated,
        userId: req.authUser?.id ?? "unknown"
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/genre/cache/stats", requireAuth, requireAdmin, (_req, res) => {
    res.json(getGenreCacheStats());
  });

  router.post("/genre/cache/clear", requireAuth, requireAdmin, (_req, res) => {
    clearGenreCache();
    log.info("MusicBrainz genre cache cleared", { userId: _req.authUser?.id ?? "unknown" });
    res.json({ cleared: true });
  });

  return router;
}
