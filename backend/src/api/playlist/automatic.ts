import { Router } from "express";

import { requireAdmin, requireAuth } from "../../auth/middleware";
import type { IndexStore } from "../../services/indexer/indexStore";
import {
  getAutoPlaylistConfig,
  getAutoPlaylistById,
  loadAutoPlaylists,
  loadAutoTrace,
  regenerateAutoPlaylists,
  updateAutoPlaylistConfig
} from "../../services/playlists/autoPlaylistService";
import { AppError } from "../../utils/AppError";
import { createLogger } from "../../utils/logger";

const log = createLogger("playlist");

export function createAutoPlaylistRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.get("/automatic/config", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const config = await getAutoPlaylistConfig();
      res.json(config);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/automatic/config", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;
      const patch: Record<string, number> = {};

      if (typeof body.maxPlaylists === "number") patch.maxPlaylists = body.maxPlaylists;
      if (typeof body.minTracksPerPlaylist === "number") patch.minTracksPerPlaylist = body.minTracksPerPlaylist;
      if (typeof body.tracksPerPlaylist === "number") patch.tracksPerPlaylist = body.tracksPerPlaylist;

      const updated = await updateAutoPlaylistConfig(patch);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.get("/automatic", requireAuth, async (_req, res, next) => {
    try {
      const playlists = await loadAutoPlaylists();
      res.json({
        playlists: playlists.map((p) => ({
          id: p.id,
          name: p.name,
          genre: p.genre,
          decade: p.decade,
          axis: p.axis,
          tempo: p.tempo,
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

  // /automatic/trace must be registered before /automatic/:id
  router.get("/automatic/trace", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const trace = await loadAutoTrace();
      if (!trace) {
        return next(new AppError("No auto-playlist trace available", 404));
      }
      res.json(trace);
    } catch (error) {
      next(error);
    }
  });

  router.get("/automatic/:id", requireAuth, async (req, res, next) => {
    try {
      const id = req.params.id;
      if (!id) {
        return next(new AppError("Playlist id is required", 400));
      }

      const playlist = await getAutoPlaylistById(id);
      if (!playlist) {
        return next(new AppError("Auto playlist not found", 404));
      }

      const tracks = playlist.trackIds
        .map((trackId) => indexStore.getTrackById(trackId))
        .filter((t) => t !== undefined);

      res.json({ playlist, tracks });
    } catch (error) {
      next(error);
    }
  });

  router.post("/automatic/regenerate", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const allTracks = indexStore.getSnapshot().tracks;
      const playlists = await regenerateAutoPlaylists(allTracks);
      log.info(`Admin triggered auto playlist regeneration: ${playlists.length} playlist(s)`);
      res.json({
        regenerated: playlists.length,
        playlists: playlists.map((p) => ({ id: p.id, name: p.name, trackCount: p.trackCount }))
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
