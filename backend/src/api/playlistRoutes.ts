import fsPromises from "node:fs/promises";
import path from "node:path";

import multer from "multer";
import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { IndexStore } from "../services/indexer/indexStore";
import { ensureDir } from "../utils/fs";
import { createLogger } from "../utils/logger";
import { AppError } from "../utils/AppError";
import { loadPlaylist, resolveTrackIds } from "../middleware/playlist";

const log = createLogger("playlists");

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_FILE_NAME = "cover.webp";

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: COVER_MAX_BYTES, files: 1 }
});
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
import type { Playlist, PlaylistVisibility, Track } from "../types/library";

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

export function findPlaylistById(indexStore: IndexStore, playlistId: string): Playlist | undefined {
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

export function createPlaylistRouter(indexStore: IndexStore): Router {
  const router = Router();

router.get("/playlists", requireAuth, (req, res, next) => {
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

router.get("/playlists/:id", requireAuth, (req, res, next) => {
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

router.post("/playlists", requireAuth, async (req, res, next) => {
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

router.put("/playlists/:id", requireAuth, async (req, res, next) => {
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

router.patch("/playlists/:id", requireAuth, async (req, res, next) => {
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

router.delete("/playlists/:id", requireAuth, async (req, res, next) => {
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

router.post("/playlists/:id/heart", requireAuth, async (req, res, next) => {
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

router.post("/playlists/:id/listen", requireAuth, async (req, res, next) => {
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

router.post(
  "/playlists/:id/cover",
  requireAuth,
  async (req, res, next) => {
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
  }
);

router.get("/playlists/:id/cover", requireAuth, async (req, res, next) => {
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

router.delete("/playlists/:id/cover", requireAuth, async (req, res, next) => {
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
