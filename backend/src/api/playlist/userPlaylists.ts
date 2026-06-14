import { Router } from "express";

import { requireAuth } from "../../auth/middleware";
import { listUsers } from "../../auth/db";
import type { IndexStore } from "../../services/indexer/indexStore";
import {
  canEditPlaylist,
  canManagePlaylist,
  createFilesystemPlaylist,
  deleteFilesystemPlaylist,
  filterPlayablePlaylists,
  updateFilesystemPlaylist
} from "../../services/playlists/playlistStore";
import { AppError } from "../../utils/AppError";
import { createLogger } from "../../utils/logger";
import {
  findPlaylistById,
  getTracksById,
  mapPlaylistResponse,
  normalizeVisibility,
  parsePlaylistName,
  parseTrackIds
} from "./helpers";

const log = createLogger("playlist");

export function createUserPlaylistRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.get("/", requireAuth, (req, res, next) => {
    const authUser = req.authUser;
    if (!authUser) {
      return next(new AppError("Authentication required", 401, "authentication"));
    }

    const snapshot = indexStore.getSnapshot();
    const playlists = filterPlayablePlaylists(snapshot.playlists ?? [], authUser).map(mapPlaylistResponse);

    res.json({
      total: playlists.length,
      playlists
    });
  });

  router.get("/:id", requireAuth, async (req, res, next) => {
    const authUser = req.authUser;
    const playlistId = req.params.id;
    if (!authUser || !playlistId) {
      return next(new AppError("Authentication required", 401, "authentication"));
    }

    const playlist = findPlaylistById(indexStore, playlistId);
    if (!playlist) {
      return next(new AppError("Playlist not found", 404, "playlistFound"));
    }

    const playable = filterPlayablePlaylists([playlist], authUser)[0];
    if (!playable) {
      return next(new AppError("Not allowed to access this playlist", 403, "allowedAccessPlaylist"));
    }

    res.json({ playlist: mapPlaylistResponse(playable) });
  });

  router.post("/", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        return next(new AppError("Authentication required", 401, "authentication"));
      }

      const visibility = normalizeVisibility(req.body?.visibility);
      if (visibility === null) {
        return next(new AppError("visibility must be public or private", 400, "visibilityPublicPrivate"));
      }

      const name = parsePlaylistName(req.body?.name);
      if (!name) {
        return next(new AppError("name is required", 400, "name"));
      }

      const trackIds = parseTrackIds(req.body?.trackIds);
      if (trackIds === null) {
        return next(new AppError("trackIds must be an array of track ids", 400, "trackidsArrayTrackIds"));
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
        return next(new AppError("Playlist was created but not found after reindex", 500, "playlistWasCreatedButFound"));
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

  router.put("/:id", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401, "authentication"));
      }

      const existing = findPlaylistById(indexStore, playlistId);
      if (!existing) {
        return next(new AppError("Playlist not found", 404, "playlistFound"));
      }

      if (!canEditPlaylist(existing, authUser)) {
        return next(new AppError("Not allowed to modify this playlist", 403, "allowedModifyPlaylist"));
      }

      const visibility = normalizeVisibility(req.body?.visibility);
      if (visibility !== "public" && visibility !== "private") {
        return next(new AppError("visibility is required and must be public or private", 400, "visibilityPublicPrivate2"));
      }

      const name = parsePlaylistName(req.body?.name);
      if (!name) {
        return next(new AppError("name is required", 400, "name"));
      }

      const trackIds = parseTrackIds(req.body?.trackIds);
      if (!trackIds) {
        return next(new AppError("trackIds is required and must be an array of track ids", 400, "trackidsArrayTrackIds2"));
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
        return next(new AppError("Playlist updated but not found after reindex", 500, "playlistUpdatedButFoundAfter"));
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

  router.patch("/:id", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401, "authentication"));
      }

      const existing = findPlaylistById(indexStore, playlistId);
      if (!existing) {
        return next(new AppError("Playlist not found", 404, "playlistFound"));
      }

      if (!canEditPlaylist(existing, authUser)) {
        return next(new AppError("Not allowed to modify this playlist", 403, "allowedModifyPlaylist"));
      }

      const visibility = normalizeVisibility(req.body?.visibility);
      if (visibility === null) {
        return next(new AppError("visibility must be public or private", 400, "visibilityPublicPrivate"));
      }

      const name = parsePlaylistName(req.body?.name);
      if (name === null) {
        return next(new AppError("name must be a non-empty string", 400, "nameNonEmptyString"));
      }

      const trackIds = parseTrackIds(req.body?.trackIds);
      if (trackIds === null) {
        return next(new AppError("trackIds must be an array of track ids", 400, "trackidsArrayTrackIds"));
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
        return next(new AppError("Playlist updated but not found after reindex", 500, "playlistUpdatedButFoundAfter"));
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

  router.delete("/:id", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      const playlistId = req.params.id;
      if (!authUser || !playlistId) {
        return next(new AppError("Authentication required", 401, "authentication"));
      }

      const existing = findPlaylistById(indexStore, playlistId);
      if (!existing) {
        return next(new AppError("Playlist not found", 404, "playlistFound"));
      }

      if (!canManagePlaylist(existing, authUser)) {
        return next(new AppError("Not allowed to delete this playlist", 403, "allowedDeletePlaylist"));
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

  return router;
}
