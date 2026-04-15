import { Router } from "express";

import { createLogger } from "../utils/logger";
import { requireAuth } from "../auth/middleware";
import type { IndexStore } from "../services/indexer/indexStore";
import {
  loadForYouPlaylists,
  getForYouPlaylistById,
  regenerateForYouPlaylists,
  dismissForYouPlaylist,
  getUserDismissals
} from "../services/playlists/forYouPlaylistService";

const log = createLogger("for-you-routes");

export function createForYouPlaylistRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.get("/playlists/for-you", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const playlists = await loadForYouPlaylists(userId);
      const dismissals = await getUserDismissals(userId);

      const visible = playlists.filter((p) => !dismissals.has(p.id));

      res.json({
        playlists: visible.map((p) => ({
          id: p.id,
          name: p.name,
          seedArtist: p.seedArtist,
          trackCount: p.trackCount,
          generatedAt: p.generatedAt
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/playlists/for-you/:id", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "Playlist id is required" });
        return;
      }

      const playlist = await getForYouPlaylistById(userId, id);
      if (!playlist) {
        res.status(404).json({ error: "For-you playlist not found" });
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

  router.post("/playlists/for-you/regenerate", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const playlists = await regenerateForYouPlaylists(userId, indexStore);
      log.info(`User ${userId} triggered for-you regeneration: ${playlists.length} playlist(s)`);
      res.json({
        regenerated: playlists.length,
        playlists: playlists.map((p) => ({
          id: p.id,
          name: p.name,
          seedArtist: p.seedArtist,
          trackCount: p.trackCount
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/playlists/for-you/:id/dismiss", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const playlistId = req.params.id;
      if (!playlistId) {
        res.status(400).json({ error: "Playlist id is required" });
        return;
      }

      await dismissForYouPlaylist(userId, playlistId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
