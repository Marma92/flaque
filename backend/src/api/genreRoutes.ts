import { Router } from "express";

import { requireAdmin, requireAuth } from "../auth/middleware";
import type { IndexStore } from "../services/indexer/indexStore";
import {
  getEnrichmentStatus,
  runBackgroundEnrichment,
  stopEnrichment
} from "../services/genre/genreEnrichmentService";
import {
  getSynonyms,
  setSynonym,
  removeSynonym,
  resetSynonymsToDefaults
} from "../services/genre/genreSynonymService";
import { getGenreCacheStats, clearGenreCache } from "../services/genre/musicBrainzService";
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

  router.get("/genre/synonyms", requireAuth, requireAdmin, (_req, res) => {
    res.json(getSynonyms());
  });

  router.put("/genre/synonyms", requireAuth, requireAdmin, (req, res) => {
    const { from, to } = req.body as { from?: string; to?: string };
    if (typeof from !== "string" || !from.trim() || typeof to !== "string" || !to.trim()) {
      res.status(400).json({ error: "Both 'from' and 'to' must be non-empty strings" });
      return;
    }

    setSynonym(from, to);
    log.info("Genre synonym updated", { from, to, userId: req.authUser?.id ?? "unknown" });
    res.json({ from: from.trim().toLowerCase(), to: to.trim() });
  });

  router.delete("/genre/synonyms/:key", requireAuth, requireAdmin, (req, res) => {
    const key = req.params.key;
    if (!key) {
      res.status(400).json({ error: "Synonym key required" });
      return;
    }

    const removed = removeSynonym(key);
    if (!removed) {
      res.status(404).json({ error: "Synonym not found" });
      return;
    }

    log.info("Genre synonym removed", { key, userId: req.authUser?.id ?? "unknown" });
    res.json({ removed: true });
  });

  router.post("/genre/synonyms/reset", requireAuth, requireAdmin, (_req, res) => {
    resetSynonymsToDefaults();
    log.info("Genre synonyms reset to defaults", { userId: _req.authUser?.id ?? "unknown" });
    res.json({ reset: true });
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
