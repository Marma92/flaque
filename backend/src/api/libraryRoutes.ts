import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import type { Track } from "../types/library";
import { IndexStore } from "../services/indexer/indexStore";
import {
  filterTracks,
  listAlbums,
  listArtists,
  listOwners,
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
