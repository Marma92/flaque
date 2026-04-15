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
  parseMetadataGenreField,
  parseMetadataYearField,
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
import { createLogger } from "../utils/logger";

const log = createLogger("library");

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
      ownerNamesById: Object.fromEntries(ownerNamesById),
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
    let filteredTracks = resolveFilteredTracks(indexStore, parsedQuery.filter, ownerNamesById);
    if (parsedQuery.addedAfter) {
      const cutoff = parsedQuery.addedAfter;
      filteredTracks = filteredTracks.filter((track) => (track.addedAt ?? "") >= cutoff);
    }
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
      const hasYear = hasOwnProperty(req.body, "year");
      const hasGenre = hasOwnProperty(req.body, "genre");

      if (!hasTitle && !hasArtist && !hasAlbum && !hasYear && !hasGenre) {
        res.status(400).json({ error: "At least one metadata field is required: title, artist, album, year, genre" });
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
      const parsedYear = hasYear ? parseMetadataYearField(req.body?.year) : undefined;
      const parsedGenre = hasGenre ? parseMetadataGenreField(req.body?.genre) : undefined;

      if (parsedTitle === null) { res.status(400).json({ error: "title must be a string or null" }); return; }
      if (parsedArtist === null) { res.status(400).json({ error: "artist must be a string or null" }); return; }
      if (parsedAlbum === null) { res.status(400).json({ error: "album must be a string or null" }); return; }
      if (parsedYear === null) { res.status(400).json({ error: "year must be an integer between 1000 and 2999, or null" }); return; }
      if (parsedGenre === null) { res.status(400).json({ error: "genre must be an array of strings or null" }); return; }

      const currentOverrides = await readTrackMetadataOverrides();
      const currentOverride = currentOverrides[trackId] ?? {};

      await mergeTrackMetadataOverrides({
        [trackId]: {
          title: hasTitle ? parsedTitle : currentOverride.title,
          artist: hasArtist ? parsedArtist : currentOverride.artist,
          album: hasAlbum ? parsedAlbum : currentOverride.album,
          year: hasYear ? parsedYear : currentOverride.year,
          genre: hasGenre ? parsedGenre : currentOverride.genre
        }
      });

      log.info("Track metadata updated", {
        trackId,
        title: currentTrack.tags.title ?? currentTrack.path,
        userId: req.authUser?.id ?? "unknown",
        fields: [hasTitle && "title", hasArtist && "artist", hasAlbum && "album", hasYear && "year", hasGenre && "genre"].filter(Boolean).join(", ")
      });

      await indexStore.rebuild();
      const ownerNamesById = getOwnerNamesById();
      const updatedTrack = indexStore.getTrackById(trackId);
      if (updatedTrack) {
        res.json({ track: mapTrackResponse(mapTrackOwners([updatedTrack], ownerNamesById)[0]!) });
        return;
      }

      const fallbackTrack = applyMetadataPatchToTrack(currentTrack, {
        hasTitle, title: parsedTitle, hasArtist, artist: parsedArtist, hasAlbum, album: parsedAlbum, hasYear, year: parsedYear, hasGenre, genre: parsedGenre
      });
      res.json({
        track: mapTrackResponse(mapTrackOwners([fallbackTrack], ownerNamesById)[0]!),
        warning: "Metadata override saved, but track is not present in rebuilt index"
      });
    } catch (error) {
      next(error);
    }
  };

  router.post("/tracks/bulk/delete", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const trackIds = req.body?.trackIds;
      if (!Array.isArray(trackIds) || trackIds.length === 0) {
        res.status(400).json({ error: "trackIds array is required" });
        return;
      }

      const validIds = trackIds.filter((id): id is string => typeof id === "string" && id.length > 0);
      if (validIds.length === 0) {
        res.status(400).json({ error: "No valid track ids provided" });
        return;
      }

      const deleted: string[] = [];
      const notFound: string[] = [];
      const overridePatch: Record<string, Record<string, never>> = {};

      for (const trackId of validIds) {
        const track = indexStore.getTrackById(trackId);
        if (!track) {
          notFound.push(trackId);
          continue;
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
        overridePatch[trackId] = {};
        deleted.push(trackId);
      }

      if (Object.keys(overridePatch).length > 0) {
        await mergeTrackMetadataOverrides(overridePatch);
      }

      log.info("Tracks deleted in bulk", {
        userId: req.authUser?.id ?? "unknown",
        deletedCount: deleted.length,
        notFoundCount: notFound.length
      });

      const rebuiltIndex = await indexStore.rebuild();
      res.json({ deleted, notFound, totalTracks: rebuiltIndex.totalTracks });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/tracks/bulk/metadata", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const trackIds = req.body?.trackIds;
      if (!Array.isArray(trackIds) || trackIds.length === 0) {
        res.status(400).json({ error: "trackIds array is required" });
        return;
      }

      const validIds = trackIds.filter((id): id is string => typeof id === "string" && id.length > 0);
      if (validIds.length === 0) {
        res.status(400).json({ error: "No valid track ids provided" });
        return;
      }

      const hasTitle = hasOwnProperty(req.body, "title");
      const hasArtist = hasOwnProperty(req.body, "artist");
      const hasAlbum = hasOwnProperty(req.body, "album");
      const hasYear = hasOwnProperty(req.body, "year");
      const hasGenre = hasOwnProperty(req.body, "genre");

      if (!hasTitle && !hasArtist && !hasAlbum && !hasYear && !hasGenre) {
        res.status(400).json({ error: "At least one metadata field is required: title, artist, album, year, genre" });
        return;
      }

      const parsedTitle = hasTitle ? parseMetadataField(req.body?.title) : undefined;
      const parsedArtist = hasArtist ? parseMetadataField(req.body?.artist) : undefined;
      const parsedAlbum = hasAlbum ? parseMetadataField(req.body?.album) : undefined;
      const parsedYear = hasYear ? parseMetadataYearField(req.body?.year) : undefined;
      const parsedGenre = hasGenre ? parseMetadataGenreField(req.body?.genre) : undefined;

      if (parsedTitle === null) { res.status(400).json({ error: "title must be a string or null" }); return; }
      if (parsedArtist === null) { res.status(400).json({ error: "artist must be a string or null" }); return; }
      if (parsedAlbum === null) { res.status(400).json({ error: "album must be a string or null" }); return; }
      if (parsedYear === null) { res.status(400).json({ error: "year must be an integer between 1000 and 2999, or null" }); return; }
      if (parsedGenre === null) { res.status(400).json({ error: "genre must be an array of strings or null" }); return; }

      const currentOverrides = await readTrackMetadataOverrides();
      const overridePatch: Record<string, { title?: string; artist?: string; album?: string; year?: number; genre?: string[] }> = {};
      const updated: string[] = [];
      const notFound: string[] = [];

      for (const trackId of validIds) {
        const track = indexStore.getTrackById(trackId);
        if (!track) {
          notFound.push(trackId);
          continue;
        }

        const current = currentOverrides[trackId] ?? {};
        overridePatch[trackId] = {
          title: hasTitle ? parsedTitle : current.title,
          artist: hasArtist ? parsedArtist : current.artist,
          album: hasAlbum ? parsedAlbum : current.album,
          year: hasYear ? parsedYear : current.year,
          genre: hasGenre ? parsedGenre : current.genre
        };
        updated.push(trackId);
      }

      if (Object.keys(overridePatch).length > 0) {
        await mergeTrackMetadataOverrides(overridePatch);
      }

      log.info("Track metadata updated in bulk", {
        userId: req.authUser?.id ?? "unknown",
        updatedCount: updated.length,
        notFoundCount: notFound.length,
        fields: [hasTitle && "title", hasArtist && "artist", hasAlbum && "album", hasYear && "year", hasGenre && "genre"].filter(Boolean).join(", ")
      });

      await indexStore.rebuild();
      res.json({ updated, notFound });
    } catch (error) {
      next(error);
    }
  });

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

      log.info("Track deleted", {
        trackId,
        title: track.tags.title ?? track.path,
        userId: req.authUser?.id ?? "unknown"
      });

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
      const albums = await attachCollaborativeAlbumCovers(tracks, "year-desc");
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

      // Group tracks by album directory so we only resolve metadata once per directory
      const tracksByDir = new Map<string, Track[]>();
      for (const track of tracksWithOwnerNames) {
        const trackAbsolutePath = resolveDataRelativePath(track.path);
        const dir = path.dirname(trackAbsolutePath);
        const existing = tracksByDir.get(dir);
        if (existing) {
          existing.push(track);
        } else {
          tracksByDir.set(dir, [track]);
        }
      }

      const metadataCache = new Map<string, ResolvedAlbumMetadata | undefined>();
      const albumTracks: Track[] = [];
      let albumName: string | undefined;
      let cover: string | undefined;

      for (const [, dirTracks] of tracksByDir) {
        const representative = dirTracks[0]!;
        const metadata = await resolveAlbumMetadataForTrack(representative, metadataCache);
        if (metadata?.id !== albumId) {
          continue;
        }
        albumTracks.push(...dirTracks);
        albumName = albumName ?? metadata.name ?? representative.tags.album;
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
