import fsPromises from "node:fs/promises";
import path from "node:path";

import { Router } from "express";
import multer from "multer";

import { requireAuth } from "../../auth/middleware";
import type { IndexStore } from "../../services/indexer/indexStore";
import {
  canEditPlaylist,
  canViewPlaylist,
  getPlaylistDirectory,
  incrementPlaylistListenCount,
  togglePlaylistHeart,
  updatePlaylistCover
} from "../../services/playlists/playlistStore";
import { AppError } from "../../utils/AppError";
import { ensureDir } from "../../utils/fs";
import { createLogger } from "../../utils/logger";
import { findPlaylistById } from "./helpers";

const log = createLogger("playlist");

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_FILE_NAME = "cover.webp";

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

export function createPlaylistEngagementRouter(indexStore: IndexStore): Router {
  const router = Router();

  const coverUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: COVER_MAX_BYTES, files: 1 }
  });

  router.post("/:id/heart", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401, "authentication"));
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist) {
        return next(new AppError("Playlist not found", 404, "playlistFound"));
      }

      if (playlist.visibility !== "public") {
        return next(new AppError("Only public playlists can be hearted", 403, "onlyPublicPlaylistsCanHearted"));
      }

      if (playlist.authorId === authUser.id) {
        return next(new AppError("Cannot heart your own playlist", 400, "cannotHeartOwnPlaylist"));
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

  router.post("/:id/listen", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401, "authentication"));
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist) {
        return next(new AppError("Playlist not found", 404, "playlistFound"));
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
        return next(new AppError("Authentication required", 401, "authentication"));
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist) {
        return next(new AppError("Playlist not found", 404, "playlistFound"));
      }

      if (!canEditPlaylist(playlist, authUser)) {
        return next(new AppError("Not allowed to modify this playlist", 403, "allowedModifyPlaylist"));
      }

      const file = req.file;
      if (!file) {
        return next(new AppError("cover image file is required", 400, "coverImageFile"));
      }

      if (!file.mimetype.toLowerCase().startsWith("image/")) {
        return next(new AppError("Unsupported image format", 400, "unsupportedImageFormat"));
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
        return next(new AppError("Invalid image file", 400, "invalidImageFile"));
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

  router.get("/:id/cover", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401, "authentication"));
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist || !playlist.cover) {
        return next(new AppError("Cover not found", 404, "coverFound"));
      }

      if (!canViewPlaylist(playlist, authUser)) {
        return next(new AppError("Not allowed to access this playlist", 403, "allowedAccessPlaylist"));
      }

      res.setHeader("Cache-Control", "private, max-age=86400");
      res.sendFile(playlist.cover);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/cover", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401, "authentication"));
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist) {
        return next(new AppError("Playlist not found", 404, "playlistFound"));
      }

      if (!canEditPlaylist(playlist, authUser)) {
        return next(new AppError("Not allowed to modify this playlist", 403, "allowedModifyPlaylist"));
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
