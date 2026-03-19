import fs from "node:fs/promises";

import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { listUsers } from "../auth/db";
import { requireAdmin, requireAuth } from "../auth/middleware";
import {
  mergeTrackMetadataOverrides,
  readTrackMetadataOverrides
} from "../services/indexer/metadataOverrideStore";
import { IndexStore } from "../services/indexer/indexStore";
import {
  attachArtistPhotos,
  attachCollaborativeAlbumCovers,
  compareAlbumTrackOrder,
  getTrackArtistName,
  normalizeAlbumName,
  parseCollaborativeAlbumId,
  resolveAlbumMetadataForTrack,
  type ResolvedAlbumMetadata
} from "../services/library/libraryMediaResolver";
import { filterPlayablePlaylists } from "../services/playlists/playlistStore";
import { deleteTrackCover } from "../services/storage/coverService";
import { resolveTrackAbsolutePath } from "../services/storage/storageService";
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

function normalizeIndexKey(value?: string): string {
  return (value ?? "").trim().toLowerCase();
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

function hasOwnProperty(value: unknown, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key);
}

function parseMetadataField(value: unknown): string | undefined | null {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function applyMetadataPatchToTrack(
  track: Track,
  patch: {
    hasTitle: boolean;
    title?: string;
    hasArtist: boolean;
    artist?: string;
    hasAlbum: boolean;
    album?: string;
  }
): Track {
  return {
    ...track,
    tags: {
      ...track.tags,
      ...(patch.hasTitle ? { title: patch.title } : {}),
      ...(patch.hasArtist ? { artist: patch.artist } : {}),
      ...(patch.hasAlbum ? { album: patch.album } : {})
    }
  };
}

function mapTrackResponse(track: Track): Track {
  return {
    ...track,
    cover: track.cover ?? `/api/covers/${track.id}`
  };
}

function getOwnerNamesById(): Map<string, string> {
  return new Map(listUsers().map((user) => [user.id, user.username]));
}

function mapTrackOwner(track: Track, ownerNamesById: Map<string, string>): Track {
  const ownerName = ownerNamesById.get(track.owner);
  if (!ownerName || ownerName === track.owner) {
    return track;
  }

  return {
    ...track,
    owner: ownerName
  };
}

function mapTrackOwners(tracks: Track[], ownerNamesById: Map<string, string>): Track[] {
  return tracks.map((track) => mapTrackOwner(track, ownerNamesById));
}

function intersectTracks(left: Track[], right: Track[]): Track[] {
  if (left.length === 0 || right.length === 0) {
    return [];
  }

  if (left.length > right.length) {
    return intersectTracks(right, left);
  }

  const rightById = new Set(right.map((track) => track.id));
  return left.filter((track) => rightById.has(track.id));
}

function collectTracksByOwnerFilter(
  indexStore: IndexStore,
  ownerFilter: string,
  ownerNamesById: Map<string, string>
): Track[] {
  const normalizedOwner = normalizeIndexKey(ownerFilter);
  const ownerIds = new Set<string>([ownerFilter]);

  for (const [ownerId, ownerName] of ownerNamesById) {
    if (
      normalizeIndexKey(ownerId) === normalizedOwner ||
      normalizeIndexKey(ownerName) === normalizedOwner
    ) {
      ownerIds.add(ownerId);
    }
  }

  const tracksById = new Map<string, Track>();
  for (const ownerId of ownerIds) {
    for (const track of indexStore.getTracksByOwner(ownerId)) {
      tracksById.set(track.id, track);
    }
  }

  return Array.from(tracksById.values());
}

function selectIndexedTracks(
  indexStore: IndexStore,
  filter: Pick<LibraryFilter, "owner" | "artist" | "album">,
  ownerNamesById: Map<string, string>
): Track[] {
  let tracks: Track[] | null = null;

  if (filter.owner) {
    tracks = collectTracksByOwnerFilter(indexStore, filter.owner, ownerNamesById);
  }

  if (filter.artist) {
    const artistTracks = indexStore.getTracksByArtist(filter.artist);
    tracks = tracks ? intersectTracks(tracks, artistTracks) : artistTracks;
  }

  if (filter.album) {
    const albumTracks = indexStore.getTracksByAlbum(filter.album);
    tracks = tracks ? intersectTracks(tracks, albumTracks) : albumTracks;
  }

  return tracks ?? indexStore.getTracks();
}

export function createLibraryRouter(indexStore: IndexStore): Router {
  const router = Router();

  const handlePatchTrackMetadata = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const trackId = req.params.id;
      if (!trackId) {
        res.status(400).json({ error: "Track id is required" });
        return;
      }

      const hasTitle = hasOwnProperty(req.body, "title");
      const hasArtist = hasOwnProperty(req.body, "artist");
      const hasAlbum = hasOwnProperty(req.body, "album");

      if (!hasTitle && !hasArtist && !hasAlbum) {
        res.status(400).json({ error: "At least one metadata field is required: title, artist, album" });
        return;
      }

      const currentTrack = indexStore.getTrackById(trackId);
      if (!currentTrack) {
        res.status(404).json({ error: "Track not found" });
        return;
      }

      const parsedTitle = hasTitle ? parseMetadataField(req.body?.title) : undefined;
      const parsedArtist = hasArtist ? parseMetadataField(req.body?.artist) : undefined;
      const parsedAlbum = hasAlbum ? parseMetadataField(req.body?.album) : undefined;

      if (parsedTitle === null) {
        res.status(400).json({ error: "title must be a string or null" });
        return;
      }

      if (parsedArtist === null) {
        res.status(400).json({ error: "artist must be a string or null" });
        return;
      }

      if (parsedAlbum === null) {
        res.status(400).json({ error: "album must be a string or null" });
        return;
      }

      const currentOverrides = await readTrackMetadataOverrides();
      const currentOverride = currentOverrides[trackId] ?? {};

      const nextOverride = {
        title: hasTitle ? parsedTitle : currentOverride.title,
        artist: hasArtist ? parsedArtist : currentOverride.artist,
        album: hasAlbum ? parsedAlbum : currentOverride.album
      };

      await mergeTrackMetadataOverrides({
        [trackId]: nextOverride
      });

      await indexStore.rebuild();
      const ownerNamesById = getOwnerNamesById();
      const updatedTrack = indexStore.getTrackById(trackId);
      if (updatedTrack) {
        res.json({ track: mapTrackResponse(mapTrackOwner(updatedTrack, ownerNamesById)) });
        return;
      }

      const fallbackTrack = applyMetadataPatchToTrack(currentTrack, {
        hasTitle,
        title: parsedTitle,
        hasArtist,
        artist: parsedArtist,
        hasAlbum,
        album: parsedAlbum
      });

      res.json({
        track: mapTrackResponse(mapTrackOwner(fallbackTrack, ownerNamesById)),
        warning: "Metadata override saved, but track is not present in rebuilt index"
      });
    } catch (error) {
      next(error);
    }
  };

  router.get("/library", requireAuth, (req, res) => {
    const snapshot = indexStore.getSnapshot();
    const ownerNamesById = getOwnerNamesById();
    const filter = readFilter(req.query as Record<string, unknown>);
    const indexedTracks = selectIndexedTracks(indexStore, filter, ownerNamesById);
    const tracksWithOwnerNames = mapTrackOwners(indexedTracks, ownerNamesById);
    const tracks = filterTracks(tracksWithOwnerNames, filter).map(mapTrackResponse);
    const playlists = req.authUser
      ? filterPlayablePlaylists(snapshot.playlists ?? [], req.authUser)
      : [];

    res.json({
      generatedAt: snapshot.generatedAt,
      totalTracks: tracks.length,
      totalPlaylists: playlists.length,
      owners: listOwners(tracksWithOwnerNames),
      artists: listArtists(tracks),
      albums: listAlbums(tracks),
      tracks,
      playlists
    });
  });

  router.get("/tracks", requireAuth, (req, res) => {
    const parsedQuery = readTracksQuery(req.query as Record<string, unknown>);
    if ("error" in parsedQuery) {
      res.status(400).json({ error: parsedQuery.error });
      return;
    }

    const ownerNamesById = getOwnerNamesById();
    const indexedTracks = selectIndexedTracks(indexStore, parsedQuery.filter, ownerNamesById);
    const tracksWithOwnerNames = mapTrackOwners(indexedTracks, ownerNamesById);
    const filteredTracks = filterTracks(tracksWithOwnerNames, parsedQuery.filter);
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
    if (!indexStore.hasTrack(trackId)) {
      res.status(404).json({ error: "Track not found" });
      return;
    }

    const ownerNamesById = getOwnerNamesById();
    const filter = readFilter(req.query as Record<string, unknown>);
    const indexedTracks = selectIndexedTracks(indexStore, filter, ownerNamesById);
    const tracksWithOwnerNames = mapTrackOwners(indexedTracks, ownerNamesById);
    const filteredTracks = filterTracks(tracksWithOwnerNames, filter);
    const adjacentTrack = getAdjacentTrack(filteredTracks, trackId, direction, wrap);

    res.json({
      direction,
      wrap,
      sourceTrackId: trackId,
      track: adjacentTrack ? mapTrackResponse(adjacentTrack) : null
    });
  });

  router.patch("/tracks/:id/metadata", requireAuth, requireAdmin, handlePatchTrackMetadata);
  router.patch("/tracks/:id", requireAuth, requireAdmin, handlePatchTrackMetadata);

  router.delete("/tracks/:id", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const trackId = req.params.id;
      if (!trackId) {
        res.status(400).json({ error: "Track id is required" });
        return;
      }

      const track = indexStore.getTrackById(trackId);
      if (!track) {
        res.status(404).json({ error: "Track not found" });
        return;
      }

      const absolutePath = resolveTrackAbsolutePath(track.path);
      try {
        await fs.unlink(absolutePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      await deleteTrackCover(trackId);
      await mergeTrackMetadataOverrides({
        [trackId]: {}
      });

      const rebuiltIndex = await indexStore.rebuild();
      res.json({
        deletedTrackId: trackId,
        totalTracks: rebuiltIndex.totalTracks
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/artists", requireAuth, async (req, res, next) => {
    try {
      const ownerNamesById = getOwnerNamesById();
      const filter = readFilter(req.query as Record<string, unknown>);
      const indexedTracks = selectIndexedTracks(indexStore, { owner: filter.owner }, ownerNamesById);
      const tracksWithOwnerNames = mapTrackOwners(indexedTracks, ownerNamesById);
      const tracks = filterTracks(tracksWithOwnerNames, {
        owner: filter.owner,
        q: filter.q
      });
      const artists = await attachArtistPhotos(tracks);
      res.json({ total: tracks.length, artists });
    } catch (error) {
      next(error);
    }
  });

  router.get("/albums", requireAuth, async (req, res, next) => {
    try {
      const ownerNamesById = getOwnerNamesById();
      const filter = readFilter(req.query as Record<string, unknown>);
      const indexedTracks = selectIndexedTracks(indexStore, filter, ownerNamesById);
      const tracksWithOwnerNames = mapTrackOwners(indexedTracks, ownerNamesById);
      const tracks = filterTracks(tracksWithOwnerNames, {
        owner: filter.owner,
        artist: filter.artist,
        q: filter.q
      });
      const albums = await attachCollaborativeAlbumCovers(tracks);
      res.json({ total: tracks.length, albums });
    } catch (error) {
      next(error);
    }
  });

  router.get("/album/:albumId", requireAuth, async (req, res, next) => {
    try {
      const albumId = req.params.albumId?.trim();
      if (!albumId) {
        res.status(400).json({ error: "Album id is required" });
        return;
      }

      const collaborativeAlbum = parseCollaborativeAlbumId(albumId);
      const ownerNamesById = getOwnerNamesById();

      if (collaborativeAlbum) {
        const indexedTracks = selectIndexedTracks(
          indexStore,
          { owner: collaborativeAlbum.owner },
          ownerNamesById
        );
        const tracksWithOwnerNames = mapTrackOwners(indexedTracks, ownerNamesById);
        const collaborativeTracks = tracksWithOwnerNames.filter((track) => {
          if (track.owner !== collaborativeAlbum.owner) {
            return false;
          }

          return normalizeAlbumName(track.tags.album) === collaborativeAlbum.normalizedAlbumName;
        });

        if (collaborativeTracks.length === 0) {
          res.status(404).json({ error: "Album not found" });
          return;
        }

        collaborativeTracks.sort(compareAlbumTrackOrder);
        const artists = new Set<string>();
        for (const track of collaborativeTracks) {
          const artistName = getTrackArtistName(track)?.trim();
          if (artistName) {
            artists.add(artistName);
          }
        }

        const firstTrack = collaborativeTracks[0];
        res.json({
          album: {
            id: albumId,
            name: firstTrack?.tags.album,
            artist: artists.size > 0 ? Array.from(artists).sort((a, b) => a.localeCompare(b)).join(", ") : undefined,
            cover: firstTrack?.cover,
            trackCount: collaborativeTracks.length
          },
          tracks: collaborativeTracks.map(mapTrackResponse)
        });
        return;
      }

      const tracksWithOwnerNames = mapTrackOwners(indexStore.getTracks(), ownerNamesById);

      const metadataCache = new Map<string, ResolvedAlbumMetadata | undefined>();
      const albumTracks: Track[] = [];
      const artists = new Set<string>();
      let albumName: string | undefined;
      let cover: string | undefined;

      for (const track of tracksWithOwnerNames) {
        const metadata = await resolveAlbumMetadataForTrack(track, metadataCache);
        if (metadata?.id !== albumId) {
          continue;
        }

        albumTracks.push(track);
        albumName = albumName ?? metadata.name ?? track.tags.album;
        cover = cover ?? metadata.coverPath;
        const artistName = getTrackArtistName(track)?.trim();
        if (artistName) {
          artists.add(artistName);
        }
      }

      if (albumTracks.length === 0) {
        res.status(404).json({ error: "Album not found" });
        return;
      }

      albumTracks.sort(compareAlbumTrackOrder);

      res.json({
        album: {
          id: albumId,
          name: albumName,
          artist: artists.size > 0 ? Array.from(artists).sort((a, b) => a.localeCompare(b)).join(", ") : undefined,
          cover,
          trackCount: albumTracks.length
        },
        tracks: albumTracks.map(mapTrackResponse)
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
