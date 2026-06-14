import { Router } from "express";

import { requireAdmin, requireAuth } from "../../auth/middleware";
import type { IndexStore } from "../../services/indexer/indexStore";
import {
  dismissForYouPlaylist,
  getForYouPlaylistById,
  getUserDismissals,
  loadForYouPlaylists,
  loadForYouTrace,
  regenerateForYouPlaylists
} from "../../services/playlists/forYouPlaylistService";
import { resolveArtistPhotoPath } from "../../services/library/libraryMediaResolver";
import { AppError } from "../../utils/AppError";
import { createLogger } from "../../utils/logger";
import { extractPrimaryArtist } from "../../utils/music";

const log = createLogger("playlist");

/**
 * Find any track from the playlist that is by the seed artist (raw or
 * primary form match), then resolve the artist photo via the same
 * artist.json lookup used by the artists view. Returns a path relative
 * to the data dir, suitable for /api/covers/from-path.
 */
async function resolveSeedArtistPhoto(
  indexStore: IndexStore,
  seedArtist: string,
  trackIds: string[],
  cache: Map<string, string | undefined>
): Promise<string | undefined> {
  const seedPrimary = extractPrimaryArtist(seedArtist).toLowerCase();
  for (const trackId of trackIds) {
    const track = indexStore.getTrackById(trackId);
    if (!track) continue;
    const raw = track.tags.artist?.trim() ?? "";
    if (!raw) continue;
    if (raw !== seedArtist && extractPrimaryArtist(raw).toLowerCase() !== seedPrimary) {
      continue;
    }
    return await resolveArtistPhotoPath(track, cache);
  }
  return undefined;
}

export function createForYouPlaylistRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.get("/for-you", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        return next(new AppError("Authentication required", 401, "authentication"));
      }

      const playlists = await loadForYouPlaylists(userId);
      const dismissals = await getUserDismissals(userId);

      const visible = playlists.filter((p) => !dismissals.has(p.id));
      const photoCache = new Map<string, string | undefined>();
      const summaries = await Promise.all(
        visible.map(async (p) => ({
          id: p.id,
          name: p.name,
          seedArtist: p.seedArtist,
          seedArtistPhoto: await resolveSeedArtistPhoto(indexStore, p.seedArtist, p.trackIds, photoCache),
          trackCount: p.trackCount,
          generatedAt: p.generatedAt,
          score: p.score,
          nameVariant: p.nameVariant,
          nameDecadeLabel: p.nameDecadeLabel
        }))
      );

      res.json({ playlists: summaries });
    } catch (error) {
      next(error);
    }
  });

  router.get("/for-you/:id", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        return next(new AppError("Authentication required", 401, "authentication"));
      }

      const id = req.params.id;
      if (!id) {
        return next(new AppError("Playlist id is required", 400, "playlistId"));
      }

      const playlist = await getForYouPlaylistById(userId, id);
      if (!playlist) {
        return next(new AppError("For-you playlist not found", 404, "playlistFound2"));
      }

      const tracks = playlist.trackIds
        .map((trackId) => indexStore.getTrackById(trackId))
        .filter((t) => t !== undefined);

      const photoCache = new Map<string, string | undefined>();
      const seedArtistPhoto = await resolveSeedArtistPhoto(indexStore, playlist.seedArtist, playlist.trackIds, photoCache);

      res.json({ playlist: { ...playlist, seedArtistPhoto }, tracks });
    } catch (error) {
      next(error);
    }
  });

  router.post("/for-you/regenerate", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        return next(new AppError("Authentication required", 401, "authentication"));
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

  router.get("/for-you/:userId/trace", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const userId = req.params.userId;
      if (!userId) {
        return next(new AppError("userId is required", 400, "userid"));
      }
      const trace = await loadForYouTrace(userId);
      if (!trace) {
        return next(new AppError("No for-you trace available for this user", 404, "noTraceAvailableUser"));
      }
      res.json(trace);
    } catch (error) {
      next(error);
    }
  });

  router.post("/for-you/:id/dismiss", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        return next(new AppError("Authentication required", 401, "authentication"));
      }

      const playlistId = req.params.id;
      if (!playlistId) {
        return next(new AppError("Playlist id is required", 400, "playlistId"));
      }

      await dismissForYouPlaylist(userId, playlistId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
