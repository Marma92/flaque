import { Router } from "express";

import {
  createPlaylist,
  deletePlaylistById,
  getAccessiblePlaylistById,
  getPlaylistById,
  listAccessiblePlaylists,
  listUsers,
  updatePlaylist
} from "../auth/db";
import { requireAuth } from "../auth/middleware";
import type { PlaylistRecord, PlaylistVisibility } from "../types/library";

const PLAYLIST_NAME_MIN_LENGTH = 1;
const PLAYLIST_NAME_MAX_LENGTH = 120;
const PLAYLIST_TRACKS_MAX_COUNT = 500;

function hasOwnProperty(value: unknown, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key);
}

function parseName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length < PLAYLIST_NAME_MIN_LENGTH || trimmed.length > PLAYLIST_NAME_MAX_LENGTH) {
    return null;
  }

  return trimmed;
}

function parseVisibility(
  value: unknown,
  fallback?: PlaylistVisibility
): PlaylistVisibility | null {
  if (value === undefined || value === null || value === "") {
    return fallback ?? null;
  }

  if (value === "private" || value === "public") {
    return value;
  }

  return null;
}

function parseTrackIds(value: unknown): string[] | null {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const unique = new Set<string>();
  const trackIds: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      return null;
    }

    const trackId = entry.trim();
    if (!trackId || unique.has(trackId)) {
      continue;
    }

    unique.add(trackId);
    trackIds.push(trackId);
  }

  if (trackIds.length > PLAYLIST_TRACKS_MAX_COUNT) {
    return null;
  }

  return trackIds;
}

function toPlaylistResponse(
  playlist: PlaylistRecord,
  ownerUsernameById: Map<string, string>,
  viewerUserId: string
): {
  id: string;
  name: string;
  visibility: PlaylistVisibility;
  owner: {
    id: string;
    username: string;
  };
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
} {
  return {
    id: playlist.id,
    name: playlist.name,
    visibility: playlist.visibility,
    owner: {
      id: playlist.ownerId,
      username: ownerUsernameById.get(playlist.ownerId) ?? playlist.ownerId
    },
    trackIds: playlist.trackIds,
    createdAt: new Date(playlist.createdAt).toISOString(),
    updatedAt: new Date(playlist.updatedAt).toISOString(),
    isOwner: playlist.ownerId === viewerUserId
  };
}

function readOwnerUsernameById(): Map<string, string> {
  return new Map(listUsers().map((user) => [user.id, user.username]));
}

export function createPlaylistRouter(): Router {
  const router = Router();

  router.get("/playlists", requireAuth, (req, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const ownerUsernameById = readOwnerUsernameById();
    const playlists = listAccessiblePlaylists(authUser.id).map((playlist) =>
      toPlaylistResponse(playlist, ownerUsernameById, authUser.id)
    );

    res.json({ playlists });
  });

  router.get("/playlists/:id", requireAuth, (req, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const playlistId = req.params.id;
    if (!playlistId) {
      res.status(400).json({ error: "Playlist id is required" });
      return;
    }

    const playlist = getAccessiblePlaylistById(playlistId, authUser.id);
    if (!playlist) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    res.json({
      playlist: toPlaylistResponse(playlist, readOwnerUsernameById(), authUser.id)
    });
  });

  router.post("/playlists", requireAuth, (req, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const name = parseName(req.body?.name);
    if (!name) {
      res.status(400).json({ error: `name must be ${PLAYLIST_NAME_MIN_LENGTH}-${PLAYLIST_NAME_MAX_LENGTH} chars` });
      return;
    }

    const visibility = parseVisibility(req.body?.visibility, "private");
    if (!visibility) {
      res.status(400).json({ error: "visibility must be private or public" });
      return;
    }

    const trackIds = parseTrackIds(req.body?.trackIds);
    if (!trackIds) {
      res.status(400).json({ error: `trackIds must be a string array (max ${PLAYLIST_TRACKS_MAX_COUNT})` });
      return;
    }

    const created = createPlaylist({
      ownerId: authUser.id,
      name,
      visibility,
      trackIds
    });

    res.status(201).json({
      playlist: toPlaylistResponse(created, readOwnerUsernameById(), authUser.id)
    });
  });

  router.patch("/playlists/:id", requireAuth, (req, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const playlistId = req.params.id;
    if (!playlistId) {
      res.status(400).json({ error: "Playlist id is required" });
      return;
    }

    const existing = getPlaylistById(playlistId);
    if (!existing) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    if (existing.ownerId !== authUser.id && authUser.role !== "admin") {
      res.status(403).json({ error: "Only the playlist owner can update this playlist" });
      return;
    }

    const hasName = hasOwnProperty(req.body, "name");
    const hasVisibility = hasOwnProperty(req.body, "visibility");
    const hasTrackIds = hasOwnProperty(req.body, "trackIds");

    if (!hasName && !hasVisibility && !hasTrackIds) {
      res.status(400).json({ error: "At least one field is required: name, visibility, trackIds" });
      return;
    }

    const parsedName = hasName ? parseName(req.body?.name) : undefined;
    if (hasName && parsedName === null) {
      res.status(400).json({ error: `name must be ${PLAYLIST_NAME_MIN_LENGTH}-${PLAYLIST_NAME_MAX_LENGTH} chars` });
      return;
    }

    const parsedVisibility = hasVisibility ? parseVisibility(req.body?.visibility) : undefined;
    if (hasVisibility && parsedVisibility === null) {
      res.status(400).json({ error: "visibility must be private or public" });
      return;
    }

    const parsedTrackIds = hasTrackIds ? parseTrackIds(req.body?.trackIds) : undefined;
    if (hasTrackIds && parsedTrackIds === null) {
      res.status(400).json({ error: `trackIds must be a string array (max ${PLAYLIST_TRACKS_MAX_COUNT})` });
      return;
    }

    const updated = updatePlaylist(playlistId, {
      name: parsedName ?? undefined,
      visibility: parsedVisibility ?? undefined,
      trackIds: parsedTrackIds ?? undefined
    });

    if (!updated) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    res.json({
      playlist: toPlaylistResponse(updated, readOwnerUsernameById(), authUser.id)
    });
  });

  router.delete("/playlists/:id", requireAuth, (req, res) => {
    const authUser = req.authUser;
    if (!authUser) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const playlistId = req.params.id;
    if (!playlistId) {
      res.status(400).json({ error: "Playlist id is required" });
      return;
    }

    const existing = getPlaylistById(playlistId);
    if (!existing) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    if (existing.ownerId !== authUser.id && authUser.role !== "admin") {
      res.status(403).json({ error: "Only the playlist owner can delete this playlist" });
      return;
    }

    const deleted = deletePlaylistById(playlistId);
    if (!deleted) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    res.status(204).send();
  });

  return router;
}
