import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { IndexStore } from "../services/indexer/indexStore";
import {
  canManagePlaylist,
  createFilesystemPlaylist,
  deleteFilesystemPlaylist,
  filterPlayablePlaylists,
  updateFilesystemPlaylist
} from "../services/playlists/playlistStore";
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

      const snapshot = indexStore.getSnapshot();
      const playlistId = await createFilesystemPlaylist({
        name,
        authorId: authUser.id,
        visibility: visibility ?? "private",
        trackIds: trackIds ?? [],
        tracksById: getTracksById(snapshot.tracks)
      });

      const rebuilt = await indexStore.rebuild();
      const playlist = rebuilt.playlists?.find((item) => item.id === playlistId);
      if (!playlist) {
        res.status(500).json({ error: "Playlist was created but not found after reindex" });
        return;
      }

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

      const rebuilt = await indexStore.rebuild();
      const updated = rebuilt.playlists?.find(
        (item) => item.authorId === existing.authorId && item.name === name
      );
      if (!updated) {
        res.status(500).json({ error: "Playlist updated but not found after reindex" });
        return;
      }

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

      const snapshot = indexStore.getSnapshot();
      await updateFilesystemPlaylist({
        id: playlistId,
        name: name ?? existing.name,
        authorId: existing.authorId,
        visibility: visibility ?? existing.visibility,
        trackIds: trackIds ?? existing.trackIds,
        tracksById: getTracksById(snapshot.tracks)
      });

      const rebuilt = await indexStore.rebuild();
      const updated = rebuilt.playlists?.find(
        (item) => item.authorId === existing.authorId && item.name === (name ?? existing.name)
      );
      if (!updated) {
        res.status(500).json({ error: "Playlist updated but not found after reindex" });
        return;
      }

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
      await indexStore.rebuild();

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
