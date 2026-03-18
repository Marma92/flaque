import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import type { Track } from "../types/library";
import { IndexStore } from "../services/indexer/indexStore";
import {
  filterTracks,
  getAdjacentTrack,
  listAlbums,
  listArtists,
  listOwners,
  type AdjacentDirection,
  type LibraryFilter
} from "../services/indexer/libraryQuery";

function normalizeQueryValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readFilter(query: Record<string, unknown>): LibraryFilter {
  return {
    owner: normalizeQueryValue(query.owner),
    artist: normalizeQueryValue(query.artist),
    album: normalizeQueryValue(query.album),
    q: normalizeQueryValue(query.q)
  };
}

function readDirection(value: unknown): AdjacentDirection | null {
  if (value === undefined || value === null || value === "") {
    return "next";
  }

  if (value === "next" || value === "previous") {
    return value;
  }

  return null;
}

function readWrap(value: unknown): boolean {
  if (typeof value !== "string") {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return true;
}

function mapTrackResponse(track: Track): Track {
  return {
    ...track,
    cover: track.cover ?? `/api/covers/${track.id}`
  };
}

export function createLibraryRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.get("/library", requireAuth, (req, res) => {
    const snapshot = indexStore.getSnapshot();
    const filter = readFilter(req.query as Record<string, unknown>);
    const tracks = filterTracks(snapshot.tracks, filter).map(mapTrackResponse);

    res.json({
      generatedAt: snapshot.generatedAt,
      totalTracks: tracks.length,
      owners: listOwners(snapshot.tracks),
      artists: listArtists(tracks),
      albums: listAlbums(tracks),
      tracks
    });
  });

  router.get("/tracks", requireAuth, (req, res) => {
    const snapshot = indexStore.getSnapshot();
    const filter = readFilter(req.query as Record<string, unknown>);
    const tracks = filterTracks(snapshot.tracks, filter).map(mapTrackResponse);
    res.json({ total: tracks.length, tracks });
  });

  router.get("/tracks/:id/adjacent", requireAuth, (req, res) => {
    const trackId = req.params.id;
    if (!trackId) {
      res.status(400).json({ error: "Track id is required" });
      return;
    }

    const direction = readDirection(req.query.direction);
    if (!direction) {
      res.status(400).json({ error: "direction must be next or previous" });
      return;
    }

    const wrap = readWrap(req.query.wrap);
    const snapshot = indexStore.getSnapshot();
    const existsInLibrary = snapshot.tracks.some((track) => track.id === trackId);
    if (!existsInLibrary) {
      res.status(404).json({ error: "Track not found" });
      return;
    }

    const filter = readFilter(req.query as Record<string, unknown>);
    const filteredTracks = filterTracks(snapshot.tracks, filter);
    const adjacentTrack = getAdjacentTrack(filteredTracks, trackId, direction, wrap);

    res.json({
      direction,
      wrap,
      sourceTrackId: trackId,
      track: adjacentTrack ? mapTrackResponse(adjacentTrack) : null
    });
  });

  router.get("/artists", requireAuth, (req, res) => {
    const snapshot = indexStore.getSnapshot();
    const filter = readFilter(req.query as Record<string, unknown>);
    const tracks = filterTracks(snapshot.tracks, {
      owner: filter.owner,
      q: filter.q
    });
    res.json({ total: tracks.length, artists: listArtists(tracks) });
  });

  router.get("/albums", requireAuth, (req, res) => {
    const snapshot = indexStore.getSnapshot();
    const filter = readFilter(req.query as Record<string, unknown>);
    const tracks = filterTracks(snapshot.tracks, {
      owner: filter.owner,
      artist: filter.artist,
      q: filter.q
    });
    res.json({ total: tracks.length, albums: listAlbums(tracks) });
  });

  return router;
}
