import fsPromises from "node:fs/promises";
import path from "node:path";

import { Router } from "express";
import multer from "multer";

import { createLogger } from "../utils/logger";
import { requireAdmin, requireAuth } from "../auth/middleware";
import type { IndexStore } from "../services/indexer/indexStore";
import { ensureDir } from "../utils/fs";
import {
  getAutoPlaylistConfig,
  updateAutoPlaylistConfig,
  loadAutoPlaylists,
  getAutoPlaylistById,
  regenerateAutoPlaylists,
  loadAutoTrace
} from "../services/playlists/autoPlaylistService";
import {
  loadForYouPlaylists,
  getForYouPlaylistById,
  regenerateForYouPlaylists,
  dismissForYouPlaylist,
  getUserDismissals,
  loadForYouTrace
} from "../services/playlists/forYouPlaylistService";
import {
  loadPersonalPlaylists,
  getPersonalPlaylistById,
  regeneratePersonalPlaylists,
  loadPersonalTrace
} from "../services/playlists/personalPlaylistService";
import {
  canEditPlaylist,
  canManagePlaylist,
  canViewPlaylist,
  createFilesystemPlaylist,
  deleteFilesystemPlaylist,
  filterPlayablePlaylists,
  getPlaylistDirectory,
  incrementPlaylistListenCount,
  togglePlaylistHeart,
  updateFilesystemPlaylist,
  updatePlaylistCover
} from "../services/playlists/playlistStore";
import { listUsers } from "../auth/db";
import { resolveArtistPhotoPath } from "../services/library/libraryMediaResolver";
import type { Playlist, PlaylistVisibility, Track } from "../types/library";
import { AppError } from "../utils/AppError";
import { extractPrimaryArtist } from "../utils/music";
import { loadPlaylist, resolveTrackIds } from "../middleware/playlist";

const log = createLogger("playlist");

/**
 * Playlist router with sub-path grouping:
 * - /playlists/automatic/* — auto-generated playlists
 * - /playlists/for-you/*   — personalized recommendation playlists
 * - /playlists/:id/*       — user-created and managed playlists
 */
export function createPlaylistRouter(indexStore: IndexStore): Router {
  const router = Router();

  const COVER_MAX_BYTES = 5 * 1024 * 1024;
  const COVER_FILE_NAME = "cover.webp";

  const coverUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: COVER_MAX_BYTES, files: 1 }
  });

  // ===== AUTOMATIC PLAYLISTS =====
  // GET /playlists/automatic/config
  router.get("/automatic/config", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const config = await getAutoPlaylistConfig();
      res.json(config);
    } catch (error) {
      next(error);
    }
  });

  // PATCH /playlists/automatic/config
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

  // GET /playlists/automatic
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

  // GET /playlists/automatic/trace — admin diagnostic (must come before /:id)
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

  // GET /playlists/automatic/:id
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

  // POST /playlists/automatic/regenerate
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

  // ===== FOR-YOU PLAYLISTS =====

  /**
   * Find any track from the playlist that is by the seed artist (raw or
   * primary form match), then resolve the artist photo via the same
   * artist.json lookup used by the artists view. Returns a path relative
   * to the data dir, suitable for /api/covers/from-path.
   */
  async function resolveSeedArtistPhoto(
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

  // GET /playlists/for-you
  router.get("/for-you", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        return next(new AppError("Authentication required", 401));
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
          seedArtistPhoto: await resolveSeedArtistPhoto(p.seedArtist, p.trackIds, photoCache),
          trackCount: p.trackCount,
          generatedAt: p.generatedAt
        }))
      );

      res.json({ playlists: summaries });
    } catch (error) {
      next(error);
    }
  });

  // GET /playlists/for-you/:id
  router.get("/for-you/:id", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        return next(new AppError("Authentication required", 401));
      }

      const id = req.params.id;
      if (!id) {
        return next(new AppError("Playlist id is required", 400));
      }

      const playlist = await getForYouPlaylistById(userId, id);
      if (!playlist) {
        return next(new AppError("For-you playlist not found", 404));
      }

      const tracks = playlist.trackIds
        .map((trackId) => indexStore.getTrackById(trackId))
        .filter((t) => t !== undefined);

      const photoCache = new Map<string, string | undefined>();
      const seedArtistPhoto = await resolveSeedArtistPhoto(playlist.seedArtist, playlist.trackIds, photoCache);

      res.json({ playlist: { ...playlist, seedArtistPhoto }, tracks });
    } catch (error) {
      next(error);
    }
  });

  // POST /playlists/for-you/regenerate
  router.post("/for-you/regenerate", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        return next(new AppError("Authentication required", 401));
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

  // GET /playlists/for-you/:userId/trace — admin diagnostic
  router.get("/for-you/:userId/trace", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const userId = req.params.userId;
      if (!userId) {
        return next(new AppError("userId is required", 400));
      }
      const trace = await loadForYouTrace(userId);
      if (!trace) {
        return next(new AppError("No for-you trace available for this user", 404));
      }
      res.json(trace);
    } catch (error) {
      next(error);
    }
  });

  // ===== PERSONAL MIXES =====

  // GET /playlists/personal
  router.get("/personal", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) return next(new AppError("Authentication required", 401));
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

  // GET /playlists/personal/trace/:userId — admin diagnostic (must come before /:id)
  router.get("/personal/trace/:userId", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const userId = req.params.userId;
      if (!userId) return next(new AppError("userId is required", 400));
      const trace = await loadPersonalTrace(userId);
      if (!trace) return next(new AppError("No personal trace available for this user", 404));
      res.json(trace);
    } catch (error) {
      next(error);
    }
  });

  // POST /playlists/personal/regenerate
  router.post("/personal/regenerate", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) return next(new AppError("Authentication required", 401));
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

  // GET /playlists/personal/:id
  router.get("/personal/:id", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) return next(new AppError("Authentication required", 401));
      const id = req.params.id;
      if (!id) return next(new AppError("Playlist id is required", 400));

      const playlist = await getPersonalPlaylistById(userId, id);
      if (!playlist) return next(new AppError("Personal playlist not found", 404));

      const tracks = playlist.trackIds
        .map((trackId) => indexStore.getTrackById(trackId))
        .filter((t) => t !== undefined);
      res.json({ playlist, tracks });
    } catch (error) {
      next(error);
    }
  });

  // POST /playlists/for-you/:id/dismiss
  router.post("/for-you/:id/dismiss", requireAuth, async (req, res, next) => {
    try {
      const userId = req.authUser?.id;
      if (!userId) {
        return next(new AppError("Authentication required", 401));
      }

      const playlistId = req.params.id;
      if (!playlistId) {
        return next(new AppError("Playlist id is required", 400));
      }

      await dismissForYouPlaylist(userId, playlistId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // ===== USER PLAYLISTS =====
  // GET /playlists
  router.get("/", requireAuth, (req, res, next) => {
    const authUser = req.authUser;
    if (!authUser) {
      return next(new AppError("Authentication required", 401));
    }

    const snapshot = indexStore.getSnapshot();
    const playlists = filterPlayablePlaylists(snapshot.playlists ?? [], authUser).map(mapPlaylistResponse);

    res.json({
      total: playlists.length,
      playlists
    });
  });

  // GET /playlists/:id
  router.get("/:id", requireAuth, async (req, res, next) => {
    const authUser = req.authUser;
    const playlistId = req.params.id;
    if (!authUser || !playlistId) {
      return next(new AppError("Authentication required", 401));
    }

    const playlist = findPlaylistById(indexStore, playlistId);
    if (!playlist) {
      return next(new AppError("Playlist not found", 404));
    }

    const playable = filterPlayablePlaylists([playlist], authUser)[0];
    if (!playable) {
      return next(new AppError("Not allowed to access this playlist", 403));
    }

    res.json({ playlist: mapPlaylistResponse(playable) });
  });

  // POST /playlists
  router.post("/", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        return next(new AppError("Authentication required", 401));
      }

      const visibility = normalizeVisibility(req.body?.visibility);
      if (visibility === null) {
        return next(new AppError("visibility must be public or private", 400));
      }

      const name = parsePlaylistName(req.body?.name);
      if (!name) {
        return next(new AppError("name is required", 400));
      }

      const trackIds = parseTrackIds(req.body?.trackIds);
      if (trackIds === null) {
        return next(new AppError("trackIds must be an array of track ids", 400));
      }

      const description = typeof req.body?.description === "string" ? req.body.description.trim() : undefined;

      const snapshot = indexStore.getSnapshot();
      const playlistId = await createFilesystemPlaylist({
        name,
        authorId: authUser.id,
        visibility: visibility ?? "private",
        trackIds: trackIds ?? [],
        tracksById: getTracksById(snapshot.tracks),
        description
      });

      const rebuilt = await indexStore.refreshPlaylists();
      const playlist = rebuilt.playlists?.find((item) => item.id === playlistId);
      if (!playlist) {
        return next(new AppError("Playlist was created but not found after reindex", 500));
      }

      log.info("Playlist created", {
        playlistId,
        name,
        userId: authUser.id,
        trackCount: trackIds?.length ?? 0,
        visibility: visibility ?? "private"
      });

      res.status(201).json({ playlist: mapPlaylistResponse(playlist) });
    } catch (error) {
      if (
        error instanceof Error &&
        /Unknown track id|Playlist name must|Playlist name is required/i.test(error.message)
      ) {
        return next(new AppError(error.message, 400));
      }
      if (error instanceof Error && /Playlist already exists/i.test(error.message)) {
        return next(new AppError(error.message, 409));
      }
      next(error);
    }
  });

  // PUT /playlists/:id
  router.put("/:id", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401));
      }

      const existing = findPlaylistById(indexStore, playlistId);
      if (!existing) {
        return next(new AppError("Playlist not found", 404));
      }

      if (!canEditPlaylist(existing, authUser)) {
        return next(new AppError("Not allowed to modify this playlist", 403));
      }

      const visibility = normalizeVisibility(req.body?.visibility);
      if (visibility !== "public" && visibility !== "private") {
        return next(new AppError("visibility is required and must be public or private", 400));
      }

      const name = parsePlaylistName(req.body?.name);
      if (!name) {
        return next(new AppError("name is required", 400));
      }

      const trackIds = parseTrackIds(req.body?.trackIds);
      if (!trackIds) {
        return next(new AppError("trackIds is required and must be an array of track ids", 400));
      }

      const snapshot = indexStore.getSnapshot();
      await updateFilesystemPlaylist({
        id: playlistId,
        name,
        authorId: existing.authorId,
        visibility,
        trackIds,
        tracksById: getTracksById(snapshot.tracks)
      });

      const rebuilt = await indexStore.refreshPlaylists();
      const updated = rebuilt.playlists?.find(
        (item) => item.authorId === existing.authorId && item.name === name
      );
      if (!updated) {
        return next(new AppError("Playlist updated but not found after reindex", 500));
      }

      log.info("Playlist updated", {
        playlistId,
        name,
        userId: authUser.id,
        trackCount: trackIds.length
      });

      res.json({ playlist: mapPlaylistResponse(updated) });
    } catch (error) {
      if (
        error instanceof Error &&
        /Unknown track id|Playlist name must|Playlist name is required/i.test(error.message)
      ) {
        return next(new AppError(error.message, 400));
      }
      if (error instanceof Error && /Playlist already exists/i.test(error.message)) {
        return next(new AppError(error.message, 409));
      }
      next(error);
    }
  });

  // PATCH /playlists/:id
  router.patch("/:id", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401));
      }

      const existing = findPlaylistById(indexStore, playlistId);
      if (!existing) {
        return next(new AppError("Playlist not found", 404));
      }

      if (!canEditPlaylist(existing, authUser)) {
        return next(new AppError("Not allowed to modify this playlist", 403));
      }

      const visibility = normalizeVisibility(req.body?.visibility);
      if (visibility === null) {
        return next(new AppError("visibility must be public or private", 400));
      }

      const name = parsePlaylistName(req.body?.name);
      if (name === null) {
        return next(new AppError("name must be a non-empty string", 400));
      }

      const trackIds = parseTrackIds(req.body?.trackIds);
      if (trackIds === null) {
        return next(new AppError("trackIds must be an array of track ids", 400));
      }

      const description = typeof req.body?.description === "string" ? req.body.description.trim() : undefined;
      const collaborators = Array.isArray(req.body?.collaborators)
        ? (req.body.collaborators as unknown[]).filter((c): c is string => typeof c === "string" && c.trim() !== "").map((c) => c.trim())
        : undefined;

      if (collaborators !== undefined && collaborators.length > 0) {
        // Validate each collaborator: either a valid user ID or the special "everyone" value
        const validUserIds = new Set(listUsers().map((u) => u.id));
        const invalid = collaborators.filter((id) => id !== "everyone" && !validUserIds.has(id));
        if (invalid.length > 0) {
          return next(new AppError(`Unknown collaborator user ids: ${invalid.join(", ")}`, 400));
        }
      }

      const snapshot = indexStore.getSnapshot();
      await updateFilesystemPlaylist({
        id: playlistId,
        name: name ?? existing.name,
        authorId: existing.authorId,
        visibility: visibility ?? existing.visibility,
        trackIds: trackIds ?? existing.trackIds,
        tracksById: getTracksById(snapshot.tracks),
        description,
        collaborators
      });

      const rebuilt = await indexStore.refreshPlaylists();
      const updated = rebuilt.playlists?.find(
        (item) => item.authorId === existing.authorId && item.name === (name ?? existing.name)
      );
      if (!updated) {
        return next(new AppError("Playlist updated but not found after reindex", 500));
      }

      log.info("Playlist patched", {
        playlistId,
        name: name ?? existing.name,
        userId: authUser.id
      });

      res.json({ playlist: mapPlaylistResponse(updated) });
    } catch (error) {
      if (
        error instanceof Error &&
        /Unknown track id|Playlist name must|Playlist name is required/i.test(error.message)
      ) {
        return next(new AppError(error.message, 400));
      }
      if (error instanceof Error && /Playlist already exists/i.test(error.message)) {
        return next(new AppError(error.message, 409));
      }
      next(error);
    }
  });

  // DELETE /playlists/:id
  router.delete("/:id", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401));
      }

      const existing = findPlaylistById(indexStore, playlistId);
      if (!existing) {
        return next(new AppError("Playlist not found", 404));
      }

      if (!canManagePlaylist(existing, authUser)) {
        return next(new AppError("Not allowed to delete this playlist", 403));
      }

      await deleteFilesystemPlaylist(playlistId);
      await indexStore.refreshPlaylists();

      log.info("Playlist deleted", {
        playlistId,
        name: existing.name,
        userId: authUser.id
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // POST /playlists/:id/heart
  router.post("/:id/heart", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401));
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist) {
        return next(new AppError("Playlist not found", 404));
      }

      if (playlist.visibility !== "public") {
        return next(new AppError("Only public playlists can be hearted", 403));
      }

      if (playlist.authorId === authUser.id) {
        return next(new AppError("Cannot heart your own playlist", 400));
      }

      const result = await togglePlaylistHeart(playlistId, authUser.id);
      await indexStore.refreshPlaylists();

      log.info("Playlist heart toggled", {
        playlistId,
        userId: authUser.id,
        hearted: result.hearted
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  // POST /playlists/:id/listen
  router.post("/:id/listen", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401));
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist) {
        return next(new AppError("Playlist not found", 404));
      }

      const debounceKey = `${authUser.id}:${playlistId}`;
      const lastListen = listenDebounceMap.get(debounceKey);
      const now = Date.now();

      if (lastListen && now - lastListen < LISTEN_DEBOUNCE_MS) {
        res.json({ listenCount: playlist.listenCount });
        return;
      }

      listenDebounceMap.set(debounceKey, now);
      const listenCount = await incrementPlaylistListenCount(playlistId);
      res.json({ listenCount });
    } catch (error) {
      next(error);
    }
  });

  // POST /playlists/:id/cover
  router.post("/:id/cover", requireAuth, async (req, res, next) => {
    try {
      await new Promise<void>((resolve, reject) => {
        coverUpload.single("cover")(req, res, (err: unknown) => (err ? reject(err) : resolve()));
      });
    } catch (error) {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return next(new AppError(`Cover image must be <= ${Math.floor(COVER_MAX_BYTES / (1024 * 1024))} MB`, 400));
      }
      next(error);
      return;
    }

    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401));
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist) {
        return next(new AppError("Playlist not found", 404));
      }

      if (!canEditPlaylist(playlist, authUser)) {
        return next(new AppError("Not allowed to modify this playlist", 403));
      }

      const file = req.file;
      if (!file) {
        return next(new AppError("cover image file is required", 400));
      }

      if (!file.mimetype.toLowerCase().startsWith("image/")) {
        return next(new AppError("Unsupported image format", 400));
      }

      const sharp = (await import("sharp")).default;
      let convertedBuffer: Buffer;
      try {
        convertedBuffer = await sharp(file.buffer)
          .rotate()
          .resize(512, 512, { fit: "cover", position: "centre" })
          .webp({ quality: 85 })
          .toBuffer();
      } catch {
        return next(new AppError("Invalid image file", 400));
      }

      const playlistDir = getPlaylistDirectory(playlistId);
      await ensureDir(playlistDir);

      const tmpPath = path.join(playlistDir, `cover-upload.${process.pid}.${Date.now()}.tmp`);
      const targetPath = path.join(playlistDir, COVER_FILE_NAME);

      await fsPromises.writeFile(tmpPath, convertedBuffer);
      await fsPromises.rename(tmpPath, targetPath);

      await updatePlaylistCover(playlistId, targetPath);
      await indexStore.refreshPlaylists();

      log.info("Playlist cover uploaded", { playlistId, userId: authUser.id });
      res.json({ ok: true, cover: targetPath });
    } catch (error) {
      next(error);
    }
  });

  // GET /playlists/:id/cover
  router.get("/:id/cover", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401));
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist || !playlist.cover) {
        return next(new AppError("Cover not found", 404));
      }

      if (!canViewPlaylist(playlist, authUser)) {
        return next(new AppError("Not allowed to access this playlist", 403));
      }

      res.setHeader("Cache-Control", "private, max-age=86400");
      res.sendFile(playlist.cover);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /playlists/:id/cover
  router.delete("/:id/cover", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401));
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist) {
        return next(new AppError("Playlist not found", 404));
      }

      if (!canEditPlaylist(playlist, authUser)) {
        return next(new AppError("Not allowed to modify this playlist", 403));
      }

      const playlistDir = getPlaylistDirectory(playlistId);
      const coverPath = path.join(playlistDir, COVER_FILE_NAME);
      await fsPromises.unlink(coverPath).catch(() => {});

      await updatePlaylistCover(playlistId, null);
      await indexStore.refreshPlaylists();

      log.info("Playlist cover removed", { playlistId, userId: authUser.id });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function normalizeVisibility(value: unknown): PlaylistVisibility | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "public" || value === "private") {
    return value;
  }
  return null;
}

function parseTrackIds(value: unknown): string[] | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const trackIds: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }
    const normalized = item.trim();
    if (!normalized) {
      return null;
    }
    trackIds.push(normalized);
  }

  return trackIds;
}

function parsePlaylistName(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  return normalized;
}

function getTracksById(tracks: Track[]): Map<string, Track> {
  return new Map(tracks.map((track) => [track.id, track]));
}

function mapPlaylistResponse(playlist: Playlist): Playlist & { trackCount: number } {
  return {
    ...playlist,
    trackCount: playlist.trackIds.length
  };
}

function findPlaylistById(indexStore: IndexStore, playlistId: string): Playlist | undefined {
  const playlists = indexStore.getSnapshot().playlists ?? [];
  return playlists.find((playlist) => playlist.id === playlistId);
}

const listenDebounceMap = new Map<string, number>();
const LISTEN_DEBOUNCE_MS = 60 * 60 * 1000; // 1 hour

// Sweep expired entries every hour to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of listenDebounceMap) {
    if (now - timestamp >= LISTEN_DEBOUNCE_MS) {
      listenDebounceMap.delete(key);
    }
  }
}, LISTEN_DEBOUNCE_MS).unref();