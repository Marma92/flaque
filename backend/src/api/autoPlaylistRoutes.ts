import { Router } from "express";

import { createLogger } from "../utils/logger";
import { requireAdmin, requireAuth } from "../auth/middleware";
import type { IndexStore } from "../services/indexer/indexStore";
import {
  getAutoPlaylistConfig,
  updateAutoPlaylistConfig,
  loadAutoPlaylists,
  getAutoPlaylistById,
  regenerateAutoPlaylists
} from "../services/playlists/autoPlaylistService";

const log = createLogger("auto-playlist-routes");

export function createAutoPlaylistRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.get("/config/auto-playlists", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const config = await getAutoPlaylistConfig();
      res.json(config);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/config/auto-playlists", requireAuth, requireAdmin, async (req, res, next) => {
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

  router.get("/playlists/automatic", requireAuth, async (_req, res, next) => {
    try {
      const playlists = await loadAutoPlaylists();
      res.json({
        playlists: playlists.map((p) => ({
          id: p.id,
          name: p.name,
          genre: p.genre,
          decade: p.decade,
          trackCount: p.trackCount,
          generatedAt: p.generatedAt,
          colors: p.colors,
          gradientAngle: p.gradientAngle
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/playlists/automatic/:id", requireAuth, async (req, res, next) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "Playlist id is required" });
        return;
      }

      const playlist = await getAutoPlaylistById(id);
      if (!playlist) {
        res.status(404).json({ error: "Auto playlist not found" });
        return;
      }

      const tracks = playlist.trackIds
        .map((trackId) => indexStore.getTrackById(trackId))
        .filter((t) => t !== undefined);

      res.json({ playlist, tracks });
    } catch (error) {
      next(error);
    }
  });

  router.post("/playlists/automatic/regenerate", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const allTracks = indexStore.getSnapshot().tracks;
      const playlists = await regenerateAutoPlaylists(allTracks);
      log.info(`Admin triggered auto playlist regeneration: ${playlists.length} playlist(s)`);
      res.json({ regenerated: playlists.length, playlists: playlists.map((p) => ({ id: p.id, name: p.name, trackCount: p.trackCount })) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
