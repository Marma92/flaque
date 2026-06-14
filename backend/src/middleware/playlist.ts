import type { NextFunction, Request, Response } from "express";
import { IndexStore } from "../services/indexer/indexStore";
import { AppError } from "../utils/AppError";
import { canViewPlaylist, canEditPlaylist, canManagePlaylist } from "../services/playlists/playlistStore";
import type { Playlist } from "../types/library";

function findPlaylistById(indexStore: IndexStore, playlistId: string): Playlist | undefined {
  const playlists = indexStore.getSnapshot().playlists ?? [];
  return playlists.find((playlist) => playlist.id === playlistId);
}

/**
 * Middleware to load a playlist by ID and attach it to the request.
 * Handles 404 if playlist not found and 403 if user cannot access it.
 */
export function loadPlaylist(
  indexStore: IndexStore,
  requireAuth: boolean = true,
  requireEdit: boolean = false,
  requireManage: boolean = false
) {
  return async function (req: Request, res: Response, next: NextFunction) {
    if (requireAuth && !req.authUser) {
      return next(new AppError("Authentication required", 401, "authentication"));
    }

    const playlistId = req.params.id;
    if (!playlistId) {
      return next(new AppError("Playlist id is required", 400, "playlistId"));
    }

    const playlist = findPlaylistById(indexStore, playlistId);
    if (!playlist) {
      return next(new AppError("Playlist not found", 404, "playlistFound"));
    }

    // Check access permissions
    if (requireAuth && req.authUser) {
      const authUser = req.authUser;
      if (!canViewPlaylist(playlist, authUser)) {
        return next(new AppError("Not allowed to access this playlist", 403, "allowedAccessPlaylist"));
      }

      if (requireEdit && !canEditPlaylist(playlist, authUser)) {
        return next(new AppError("Not allowed to modify this playlist", 403, "allowedModifyPlaylist"));
      }

      if (requireManage && !canManagePlaylist(playlist, authUser)) {
        return next(new AppError("Not allowed to delete this playlist", 403, "allowedDeletePlaylist"));
      }
    }

    // Attach playlist to request for use in route handlers
    (req as any).playlist = playlist;
    next();
  };
}

/**
 * Middleware to resolve track IDs to actual Track objects.
 * Attaches resolved tracks to request for use in route handlers.
 */
export function resolveTrackIds(
  indexStore: IndexStore,
  propertyName: string = "tracks"
) {
  return async function (req: Request, res: Response, next: NextFunction) {
    // Check if trackIds are present in request body or params
    const trackIds = req.body.trackIds || (req as any).trackIds;
    if (!trackIds) {
      return next();
    }

    if (!Array.isArray(trackIds)) {
      return next(new AppError("trackIds must be an array of track ids", 400, "trackidsArrayTrackIds"));
    }

    if (trackIds.length === 0) {
      return next();
    }

    // Validate each track ID is a string
    for (const item of trackIds) {
      if (typeof item !== "string") {
        return next(new AppError("trackIds must be an array of track ids", 400, "trackidsArrayTrackIds"));
      }
      const normalized = item.trim();
      if (!normalized) {
        return next(new AppError("trackIds must be an array of track ids", 400, "trackidsArrayTrackIds"));
      }
    }

    // Resolve track IDs to Track objects
    const tracksById = indexStore.getTracksById(trackIds);
    const tracks = trackIds.map((id) => tracksById.get(id)).filter((t): t is NonNullable<typeof t> => t !== undefined);

    // Attach resolved tracks to request
    (req as any)[propertyName] = tracks;
    next();
  };
}