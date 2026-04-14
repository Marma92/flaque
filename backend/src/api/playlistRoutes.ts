import fsPromises from "node:fs/promises";
import path from "node:path";

import multer from "multer";
import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { IndexStore } from "../services/indexer/indexStore";
import { ensureDir } from "../utils/fs";
import { createLogger } from "../utils/logger";

const log = createLogger("playlists");

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_FILE_NAME = "cover.webp";

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: COVER_MAX_BYTES, files: 1 }
});
import {
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

export function createPlaylistRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.get("/playlists", requireAuth, (req, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const snapshot = indexStore.getSnapshot();
    const playlists = filterPlayablePlaylists(snapshot.playlists ?? [], authUser).map(mapPlaylistResponse);

    res.json({
      total: playlists.length,
      playlists
    });
  });

  router.get("/playlists/:id", requireAuth, (req, res) => {
    const authUser = req.authUser;
    const playlistId = req.params.id;
    if (!authUser || !playlistId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const playlist = findPlaylistById(indexStore, playlistId);
    if (!playlist) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    const playable = filterPlayablePlaylists([playlist], authUser)[0];
    if (!playable) {
      res.status(403).json({ error: "Not allowed to access this playlist" });
      return;
    }

    res.json({ playlist: mapPlaylistResponse(playable) });
  });

  router.post("/playlists", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const visibility = normalizeVisibility(req.body?.visibility);
      if (visibility === null) {
        res.status(400).json({ error: "visibility must be public or private" });
        return;
      }

      const name = parsePlaylistName(req.body?.name);
      if (!name) {
        res.status(400).json({ error: "name is required" });
        return;
      }

      const trackIds = parseTrackIds(req.body?.trackIds);
      if (trackIds === null) {
        res.status(400).json({ error: "trackIds must be an array of track ids" });
        return;
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
        res.status(500).json({ error: "Playlist was created but not found after reindex" });
        return;
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
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof Error && /Playlist already exists/i.test(error.message)) {
        res.status(409).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.put("/playlists/:id", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const existing = findPlaylistById(indexStore, playlistId);
      if (!existing) {
        res.status(404).json({ error: "Playlist not found" });
        return;
      }

      if (!canManagePlaylist(existing, authUser)) {
        res.status(403).json({ error: "Not allowed to modify this playlist" });
        return;
      }

      const visibility = normalizeVisibility(req.body?.visibility);
      if (visibility !== "public" && visibility !== "private") {
        res.status(400).json({ error: "visibility is required and must be public or private" });
        return;
      }

      const name = parsePlaylistName(req.body?.name);
      if (!name) {
        res.status(400).json({ error: "name is required" });
        return;
      }

      const trackIds = parseTrackIds(req.body?.trackIds);
      if (!trackIds) {
        res.status(400).json({ error: "trackIds is required and must be an array of track ids" });
        return;
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
        res.status(500).json({ error: "Playlist updated but not found after reindex" });
        return;
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
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof Error && /Playlist already exists/i.test(error.message)) {
        res.status(409).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.patch("/playlists/:id", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const existing = findPlaylistById(indexStore, playlistId);
      if (!existing) {
        res.status(404).json({ error: "Playlist not found" });
        return;
      }

      if (!canManagePlaylist(existing, authUser)) {
        res.status(403).json({ error: "Not allowed to modify this playlist" });
        return;
      }

      const visibility = normalizeVisibility(req.body?.visibility);
      if (visibility === null) {
        res.status(400).json({ error: "visibility must be public or private" });
        return;
      }

      const name = parsePlaylistName(req.body?.name);
      if (name === null) {
        res.status(400).json({ error: "name must be a non-empty string" });
        return;
      }

      const trackIds = parseTrackIds(req.body?.trackIds);
      if (trackIds === null) {
        res.status(400).json({ error: "trackIds must be an array of track ids" });
        return;
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
          res.status(400).json({ error: `Unknown collaborator user ids: ${invalid.join(", ")}` });
          return;
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
        res.status(500).json({ error: "Playlist updated but not found after reindex" });
        return;
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
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof Error && /Playlist already exists/i.test(error.message)) {
        res.status(409).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.delete("/playlists/:id", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const existing = findPlaylistById(indexStore, playlistId);
      if (!existing) {
        res.status(404).json({ error: "Playlist not found" });
        return;
      }

      if (!canManagePlaylist(existing, authUser)) {
        res.status(403).json({ error: "Not allowed to delete this playlist" });
        return;
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
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist) {
        res.status(404).json({ error: "Playlist not found" });
        return;
      }

      if (playlist.visibility !== "public") {
        res.status(403).json({ error: "Only public playlists can be hearted" });
        return;
      }

      if (playlist.authorId === authUser.id) {
        res.status(400).json({ error: "Cannot heart your own playlist" });
        return;
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
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist) {
        res.status(404).json({ error: "Playlist not found" });
        return;
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
          res.status(400).json({ error: `Cover image must be <= ${Math.floor(COVER_MAX_BYTES / (1024 * 1024))} MB` });
          return;
        }
        next(error);
        return;
      }

      try {
        const authUser = req.authUser;
        const playlistId = req.params.id;
        if (!authUser || !playlistId) {
          res.status(401).json({ error: "Authentication required" });
          return;
        }

        const playlist = findPlaylistById(indexStore, playlistId);
        if (!playlist) {
          res.status(404).json({ error: "Playlist not found" });
          return;
        }

        if (!canManagePlaylist(playlist, authUser)) {
          res.status(403).json({ error: "Not allowed to modify this playlist" });
          return;
        }

        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "cover image file is required" });
          return;
        }

        if (!file.mimetype.toLowerCase().startsWith("image/")) {
          res.status(400).json({ error: "Unsupported image format" });
          return;
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
          res.status(400).json({ error: "Invalid image file" });
          return;
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
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist || !playlist.cover) {
        res.status(404).json({ error: "Cover not found" });
        return;
      }

      if (!canViewPlaylist(playlist, authUser)) {
        res.status(403).json({ error: "Not allowed to access this playlist" });
        return;
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
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const playlist = findPlaylistById(indexStore, playlistId);
      if (!playlist) {
        res.status(404).json({ error: "Playlist not found" });
        return;
      }

      if (!canManagePlaylist(playlist, authUser)) {
        res.status(403).json({ error: "Not allowed to modify this playlist" });
        return;
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
