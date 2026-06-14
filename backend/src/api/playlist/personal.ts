import { Router } from "express";

import { requireAdmin, requireAuth } from "../../auth/middleware";
import type { IndexStore } from "../../services/indexer/indexStore";
import {
  getPersonalPlaylistById,
  loadPersonalPlaylists,
  loadPersonalTrace,
  regeneratePersonalPlaylists
} from "../../services/playlists/personalPlaylistService";
import { AppError } from "../../utils/AppError";
import { createLogger } from "../../utils/logger";

const log = createLogger("playlist");

export function createPersonalPlaylistRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.get("/personal", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) return next(new AppError("Authentication required", 401, "authentication"));
      const playlists = await loadPersonalPlaylists(userId);
      res.json({
        playlists: playlists.map((p) => ({
          id: p.id,
          variant: p.variant,
          name: p.name,
          description: p.description,
          trackCount: p.trackCount,
          generatedAt: p.generatedAt,
          colors: p.colors,
          gradientAngle: p.gradientAngle,
          mosaicCovers: p.mosaicCovers
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  // /personal/trace/:userId must be registered before /personal/:id
  router.get("/personal/trace/:userId", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const userId = req.params.userId;
      if (!userId) return next(new AppError("userId is required", 400, "userid"));
      const trace = await loadPersonalTrace(userId);
      if (!trace) return next(new AppError("No personal trace available for this user", 404, "noPersonalTraceAvailableUser"));
      res.json(trace);
    } catch (error) {
      next(error);
    }
  });

  router.post("/personal/regenerate", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) return next(new AppError("Authentication required", 401, "authentication"));
      const playlists = await regeneratePersonalPlaylists(userId, indexStore);
      log.info(`User ${userId} triggered personal regeneration: ${playlists.length} playlist(s)`);
      res.json({
        regenerated: playlists.length,
        playlists: playlists.map((p) => ({
          id: p.id,
          variant: p.variant,
          name: p.name,
          trackCount: p.trackCount
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/personal/:id", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) return next(new AppError("Authentication required", 401, "authentication"));
      const id = req.params.id;
      if (!id) return next(new AppError("Playlist id is required", 400, "playlistId"));

      const playlist = await getPersonalPlaylistById(userId, id);
      if (!playlist) return next(new AppError("Personal playlist not found", 404, "personalPlaylistFound"));

      const tracks = playlist.trackIds
        .map((trackId) => indexStore.getTrackById(trackId))
        .filter((t) => t !== undefined);
      res.json({ playlist, tracks });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
