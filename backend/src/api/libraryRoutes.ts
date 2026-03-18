import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { IndexStore } from "../services/indexer/indexStore";
import {
  filterTracks,
  getAdjacentTrack,
  listAlbums,
  listArtists,
  listOwners,
  paginateTracks,
  sortTracks,
  type AdjacentDirection,
  type LibraryFilter,
  type TrackSortBy,
  type TrackSortDirection
} from "../services/indexer/libraryQuery";
import type { Track } from "../types/library";

const DEFAULT_TRACKS_PAGE = 1;
const DEFAULT_TRACKS_LIMIT = 100;
const MAX_TRACKS_LIMIT = 500;

const SUPPORTED_TRACK_SORT_FIELDS = new Set<TrackSortBy>([
  "title",
  "artist",
  "album",
  "owner",
  "duration",
  "codec",
  "bitrate",
  "sampleRate",
  "path"
]);

function normalizeQueryValue(value: unknown): string | undefined {
  const firstValue = Array.isArray(value) ? value[0] : value;
  if (typeof firstValue !== "string") {
    return undefined;
  }

  const trimmed = firstValue.trim();
  return trimmed ? trimmed : undefined;
}

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  bounds?: { min?: number; max?: number }
): number | null {
  const normalized = normalizeQueryValue(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  if (bounds?.min !== undefined && parsed < bounds.min) {
    return null;
  }

  if (bounds?.max !== undefined && parsed > bounds.max) {
    return null;
  }

  return parsed;
}

function parseTrackSortBy(value: unknown): TrackSortBy | null | undefined {
  const normalized = normalizeQueryValue(value);
  if (!normalized) {
    return undefined;
  }

  if (SUPPORTED_TRACK_SORT_FIELDS.has(normalized as TrackSortBy)) {
    return normalized as TrackSortBy;
  }

  return null;
}

function parseTrackSortDirection(value: unknown): TrackSortDirection | null {
  const normalized = normalizeQueryValue(value);
  if (!normalized) {
    return "asc";
  }

  if (normalized === "asc" || normalized === "desc") {
    return normalized;
  }

  return null;
}

function readFilter(query: Record<string, unknown>): LibraryFilter {
  return {
    owner: normalizeQueryValue(query.owner),
    artist: normalizeQueryValue(query.artist),
    album: normalizeQueryValue(query.album),
    q: normalizeQueryValue(query.q)
  };
}

function readTracksQuery(query: Record<string, unknown>):
  | {
      page: number;
      limit: number;
      sortBy?: TrackSortBy;
      sortDir: TrackSortDirection;
      filter: LibraryFilter;
    }
  | {
      error: string;
    } {
  const page = parsePositiveInteger(query.page, DEFAULT_TRACKS_PAGE, { min: 1 });
  if (page === null) {
    return { error: "page must be an integer >= 1" };
  }

  const limit = parsePositiveInteger(query.limit, DEFAULT_TRACKS_LIMIT, {
    min: 1,
    max: MAX_TRACKS_LIMIT
  });
  if (limit === null) {
    return { error: `limit must be an integer between 1 and ${MAX_TRACKS_LIMIT}` };
  }

  const sortBy = parseTrackSortBy(query.sortBy);
  if (sortBy === null) {
    return {
      error:
        "sortBy must be one of: title, artist, album, owner, duration, codec, bitrate, sampleRate, path"
    };
  }

  const sortDir = parseTrackSortDirection(query.sortDir);
  if (!sortDir) {
    return { error: "sortDir must be asc or desc" };
  }

  return {
    page,
    limit,
    sortBy,
    sortDir,
    filter: readFilter(query)
  };
}

function readDirection(value: unknown): AdjacentDirection | null {
  const normalized = normalizeQueryValue(value);
  if (!normalized) {
    return "next";
  }

  if (normalized === "next" || normalized === "previous") {
    return normalized;
  }

  return null;
}

function readWrap(value: unknown): boolean {
  const normalized = normalizeQueryValue(value);
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
    const parsedQuery = readTracksQuery(req.query as Record<string, unknown>);
    if ("error" in parsedQuery) {
      res.status(400).json({ error: parsedQuery.error });
      return;
    }

    const snapshot = indexStore.getSnapshot();
    const filteredTracks = filterTracks(snapshot.tracks, parsedQuery.filter);
    const sortedTracks = parsedQuery.sortBy
      ? sortTracks(filteredTracks, parsedQuery.sortBy, parsedQuery.sortDir)
      : filteredTracks;
    const paginated = paginateTracks(sortedTracks, parsedQuery.page, parsedQuery.limit);

    res.json({
      total: paginated.total,
      page: paginated.page,
      limit: paginated.limit,
      totalPages: paginated.totalPages,
      sortBy: parsedQuery.sortBy ?? "index",
      sortDir: parsedQuery.sortDir,
      tracks: paginated.tracks.map(mapTrackResponse)
    });
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
