import fs from "node:fs/promises";
import path from "node:path";

import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

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
import { resolveDataRelativePath } from "../utils/paths";
import {
  filterTracks,
  getAdjacentTrack,
  listAlbums,
  listArtists,
  listOwners,
  paginateTracks,
  sortTracks
} from "../services/indexer/libraryQuery";
import type { Track } from "../types/library";
import {
  hasOwnProperty,
  parseMetadataField,
  readDirection,
  readFilter,
  readTracksQuery,
  readWrap
} from "./queryParsers";
import {
  applyMetadataPatchToTrack,
  getOwnerNamesById,
  mapTrackOwners,
  mapTrackResponse,
  resolveFilteredTracks,
  selectIndexedTracks
} from "./trackPipeline";

// ── Album detail helpers ────────────────────────────────────────────────

function collectAlbumArtists(tracks: Track[]): string | undefined {
  const artists = new Set<string>();
  for (const track of tracks) {
    const artistName = getTrackArtistName(track)?.trim();
    if (artistName) {
      artists.add(artistName);
    }
  }
  return artists.size > 0
    ? Array.from(artists).sort((a, b) => a.localeCompare(b)).join(", ")
    : undefined;
}

function buildAlbumResponse(
  albumId: string,
  albumName: string | undefined,
  cover: string | undefined,
  tracks: Track[]
) {
  return {
    album: {
      id: albumId,
      name: albumName,
      artist: collectAlbumArtists(tracks),
      cover,
      trackCount: tracks.length
    },
    tracks: tracks.map(mapTrackResponse)
  };
}

function getTrackArtistDirectorySegment(track: Track): string | undefined {
  try {
    const trackAbsolutePath = resolveDataRelativePath(track.path);
    const albumDir = path.dirname(trackAbsolutePath);
    const artistDir = path.dirname(albumDir);
    const segment = path.basename(artistDir).trim().toLowerCase();
    return segment || undefined;
  } catch {
    return undefined;
  }
}

// ── Router ──────────────────────────────────────────────────────────────

export function createLibraryRouter(indexStore: IndexStore): Router {
  const router = Router();

  // GET /library
  router.get("/library", requireAuth, (req, res) => {
    const snapshot = indexStore.getSnapshot();
    const ownerNamesById = getOwnerNamesById();
    const filter = readFilter(req.query as Record<string, unknown>);
    const filteredTracks = resolveFilteredTracks(indexStore, filter, ownerNamesById);
    const tracks = filteredTracks.map(mapTrackResponse);
    const playlists = req.authUser
      ? filterPlayablePlaylists(snapshot.playlists ?? [], req.authUser)
      : [];

    res.json({
      generatedAt: snapshot.generatedAt,
      totalTracks: tracks.length,
      totalPlaylists: playlists.length,
      owners: listOwners(filteredTracks),
      artists: listArtists(tracks),
      albums: listAlbums(tracks),
      tracks,
      playlists
    });
  });

  // GET /tracks
  router.get("/tracks", requireAuth, (req, res) => {
    const parsedQuery = readTracksQuery(req.query as Record<string, unknown>);
    if ("error" in parsedQuery) {
      res.status(400).json({ error: parsedQuery.error });
      return;
    }

    const ownerNamesById = getOwnerNamesById();
    const filteredTracks = resolveFilteredTracks(indexStore, parsedQuery.filter, ownerNamesById);
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

  // GET /tracks/:id/adjacent
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
    const filteredTracks = resolveFilteredTracks(indexStore, filter, ownerNamesById);
    const adjacentTrack = getAdjacentTrack(filteredTracks, trackId, direction, wrap);

    res.json({
      direction,
      wrap,
      sourceTrackId: trackId,
      track: adjacentTrack ? mapTrackResponse(adjacentTrack) : null
    });
  });

  // PATCH /tracks/:id/metadata and /tracks/:id
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

      if (parsedTitle === null) { res.status(400).json({ error: "title must be a string or null" }); return; }
      if (parsedArtist === null) { res.status(400).json({ error: "artist must be a string or null" }); return; }
      if (parsedAlbum === null) { res.status(400).json({ error: "album must be a string or null" }); return; }

      const currentOverrides = await readTrackMetadataOverrides();
      const currentOverride = currentOverrides[trackId] ?? {};

      await mergeTrackMetadataOverrides({
        [trackId]: {
          title: hasTitle ? parsedTitle : currentOverride.title,
          artist: hasArtist ? parsedArtist : currentOverride.artist,
          album: hasAlbum ? parsedAlbum : currentOverride.album
        }
      });

      await indexStore.rebuild();
      const ownerNamesById = getOwnerNamesById();
      const updatedTrack = indexStore.getTrackById(trackId);
      if (updatedTrack) {
        res.json({ track: mapTrackResponse(mapTrackOwners([updatedTrack], ownerNamesById)[0]!) });
        return;
      }

      const fallbackTrack = applyMetadataPatchToTrack(currentTrack, {
        hasTitle, title: parsedTitle, hasArtist, artist: parsedArtist, hasAlbum, album: parsedAlbum
      });
      res.json({
        track: mapTrackResponse(mapTrackOwners([fallbackTrack], ownerNamesById)[0]!),
        warning: "Metadata override saved, but track is not present in rebuilt index"
      });
    } catch (error) {
      next(error);
    }
  };

  router.patch("/tracks/:id/metadata", requireAuth, requireAdmin, handlePatchTrackMetadata);
  router.patch("/tracks/:id", requireAuth, requireAdmin, handlePatchTrackMetadata);

  // DELETE /tracks/:id
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
      await mergeTrackMetadataOverrides({ [trackId]: {} });

      const rebuiltIndex = await indexStore.rebuild();
      res.json({ deletedTrackId: trackId, totalTracks: rebuiltIndex.totalTracks });
    } catch (error) {
      next(error);
    }
  });

  // GET /artists
  router.get("/artists", requireAuth, async (req, res, next) => {
    try {
      const ownerNamesById = getOwnerNamesById();
      const filter = readFilter(req.query as Record<string, unknown>);
      const indexedTracks = selectIndexedTracks(indexStore, { owner: filter.owner }, ownerNamesById);
      const tracksWithOwnerNames = mapTrackOwners(indexedTracks, ownerNamesById);
      const tracks = filterTracks(tracksWithOwnerNames, { owner: filter.owner, q: filter.q });
      const artists = await attachArtistPhotos(tracks);
      res.json({ total: tracks.length, artists });
    } catch (error) {
      next(error);
    }
  });

  // GET /artists/:artist/albums
  router.get("/artists/:artist/albums", requireAuth, async (req, res, next) => {
    try {
      const normalizedArtist = req.params.artist?.trim().toLowerCase();
      if (!normalizedArtist) {
        res.status(400).json({ error: "Artist is required" });
        return;
      }

      const ownerNamesById = getOwnerNamesById();
      const filter = readFilter(req.query as Record<string, unknown>);
      const indexedTracks = selectIndexedTracks(indexStore, { owner: filter.owner }, ownerNamesById);
      const tracksWithOwnerNames = mapTrackOwners(indexedTracks, ownerNamesById);
      const tracksForArtist = tracksWithOwnerNames.filter(
        (track) => getTrackArtistDirectorySegment(track) === normalizedArtist
      );
      const tracks = filterTracks(tracksForArtist, { owner: filter.owner, q: filter.q });
      const albums = await attachCollaborativeAlbumCovers(tracks);
      res.json({ total: tracks.length, artist: normalizedArtist, albums });
    } catch (error) {
      next(error);
    }
  });

  // GET /albums
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

  // GET /album/:albumId
  router.get("/album/:albumId", requireAuth, async (req, res, next) => {
    try {
      const albumId = req.params.albumId?.trim();
      if (!albumId) {
        res.status(400).json({ error: "Album id is required" });
        return;
      }

      const ownerNamesById = getOwnerNamesById();
      const collaborativeAlbum = parseCollaborativeAlbumId(albumId);

      if (collaborativeAlbum) {
        const allTracks = mapTrackOwners(
          selectIndexedTracks(indexStore, {}, ownerNamesById),
          ownerNamesById
        );
        const matchingTracks = allTracks.filter(
          (track) => normalizeAlbumName(track.tags.album) === collaborativeAlbum.normalizedAlbumName
        );
        if (matchingTracks.length === 0) {
          res.status(404).json({ error: "Album not found" });
          return;
        }
        matchingTracks.sort(compareAlbumTrackOrder);
        res.json(buildAlbumResponse(albumId, matchingTracks[0]?.tags.album, matchingTracks[0]?.cover, matchingTracks));
        return;
      }

      const tracksWithOwnerNames = mapTrackOwners(indexStore.getTracks(), ownerNamesById);
      const metadataCache = new Map<string, ResolvedAlbumMetadata | undefined>();
      const albumTracks: Track[] = [];
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
      }

      if (albumTracks.length === 0) {
        res.status(404).json({ error: "Album not found" });
        return;
      }

      albumTracks.sort(compareAlbumTrackOrder);
      res.json(buildAlbumResponse(albumId, albumName, cover, albumTracks));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
