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
import { AppError } from "../utils/AppError";
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
  router.get("/tracks", requireAuth, (req, res, next) => {
    const parsedQuery = readTracksQuery(req.query as Record<string, unknown>);
    if ("error" in parsedQuery) {
      return next(new AppError(parsedQuery.error, 400));
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

  // GET /recent-uploads
  router.get("/recent-uploads", requireAuth, (req, res, next) => {
    const addedAfterRaw = typeof req.query.addedAfter === "string" ? req.query.addedAfter : "";
    if (!addedAfterRaw) {
      return next(new AppError("addedAfter is required", 400));
    }
    const parsedDate = Date.parse(addedAfterRaw);
    if (Number.isNaN(parsedDate)) {
      return next(new AppError("addedAfter must be a valid ISO 8601 date string", 400));
    }
    const addedAfter = new Date(parsedDate).toISOString();

    const limitRaw = Number(req.query.limit ?? 12);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), 100)
      : 12;

    const ownerNamesById = getOwnerNamesById();
    const filter = readFilter(req.query as Record<string, unknown>);
    const filteredTracks = resolveFilteredTracks(indexStore, filter, ownerNamesById)
      .filter((t) => (t.addedAt ?? "") >= addedAfter)
      .sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));

    const albumKeyOf = (t: Track): string | null => {
      const album = t.tags.album?.trim();
      if (!album) return null;
      const albumArtist = t.tags.albumArtist?.trim() ?? t.tags.artist?.trim() ?? "";
      return `${album}\u0000${albumArtist}\u0000${t.owner}`;
    };

    const buckets = new Map<string, Track[]>();
    for (const t of filteredTracks) {
      const k = albumKeyOf(t);
      if (k) {
        const existing = buckets.get(k);
        if (existing) existing.push(t);
        else buckets.set(k, [t]);
      }
    }

    const seen = new Set<string>();
    const items: Array<
      | { kind: "track"; track: ReturnType<typeof mapTrackResponse> }
      | {
          kind: "album";
          album: {
            albumName: string;
            artist: string;
            owner: string;
            ownerName?: string;
            trackCount: number;
            coverTrackId: string;
            tracks: ReturnType<typeof mapTrackResponse>[];
          };
        }
    > = [];

    for (const t of filteredTracks) {
      if (items.length >= limit) break;
      const k = albumKeyOf(t);
      if (k && (buckets.get(k)?.length ?? 0) >= 2) {
        if (seen.has(k)) continue;
        seen.add(k);
        const groupTracks = [...buckets.get(k)!].sort(compareAlbumTrackOrder);
        const firstTrack = groupTracks[0]!;
        items.push({
          kind: "album",
          album: {
            albumName: t.tags.album!.trim(),
            artist: t.tags.albumArtist?.trim() ?? t.tags.artist?.trim() ?? "Unknown artist",
            owner: t.owner,
            trackCount: groupTracks.length,
            coverTrackId: firstTrack.id,
            tracks: groupTracks.map(mapTrackResponse)
          }
        });
      } else {
        items.push({ kind: "track", track: mapTrackResponse(t) });
      }
    }

    res.json({ items });
  });

  // GET /tracks/:id/adjacent
  router.get("/tracks/:id/adjacent", requireAuth, (req, res, next) => {
    const trackId = req.params.id;
    if (!trackId) {
      return next(new AppError("Track id is required", 400));
    }

    const direction = readDirection(req.query.direction);
    if (!direction) {
      return next(new AppError("direction must be next or previous", 400));
    }

    const wrap = readWrap(req.query.wrap);
    if (!indexStore.hasTrack(trackId)) {
      return next(new AppError("Track not found", 404));
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
        return next(new AppError("Track id is required", 400));
      }

      const hasTitle = hasOwnProperty(req.body, "title");
      const hasArtist = hasOwnProperty(req.body, "artist");
      const hasAlbum = hasOwnProperty(req.body, "album");
      const hasYear = hasOwnProperty(req.body, "year");
      const hasGenre = hasOwnProperty(req.body, "genre");

      if (!hasTitle && !hasArtist && !hasAlbum && !hasYear && !hasGenre) {
        return next(new AppError("At least one metadata field is required: title, artist, album, year, genre", 400));
      }

      const currentTrack = indexStore.getTrackById(trackId);
      if (!currentTrack) {
        return next(new AppError("Track not found", 404));
      }

      const parsedTitle = hasTitle ? parseMetadataField(req.body?.title) : undefined;
      const parsedArtist = hasArtist ? parseMetadataField(req.body?.artist) : undefined;
      const parsedAlbum = hasAlbum ? parseMetadataField(req.body?.album) : undefined;
      const parsedYear = hasYear ? parseMetadataYearField(req.body?.year) : undefined;
      const parsedGenre = hasGenre ? parseMetadataGenreField(req.body?.genre) : undefined;

      if (parsedTitle === null) return next(new AppError("title must be a string or null", 400));
      if (parsedArtist === null) return next(new AppError("artist must be a string or null", 400));
      if (parsedAlbum === null) return next(new AppError("album must be a string or null", 400));
      if (parsedYear === null) return next(new AppError("year must be an integer between 1000 and 2999, or null", 400));
      if (parsedGenre === null) return next(new AppError("genre must be an array of strings or null", 400));

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
        return next(new AppError("trackIds array is required", 400));
      }

      const validIds = trackIds.filter((id): id is string => typeof id === "string" && id.length > 0);
      if (validIds.length === 0) {
        return next(new AppError("No valid track ids provided", 400));
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
        return next(new AppError("trackIds array is required", 400));
      }

      const validIds = trackIds.filter((id): id is string => typeof id === "string" && id.length > 0);
      if (validIds.length === 0) {
        return next(new AppError("No valid track ids provided", 400));
      }

      const hasTitle = hasOwnProperty(req.body, "title");
      const hasArtist = hasOwnProperty(req.body, "artist");
      const hasAlbum = hasOwnProperty(req.body, "album");
      const hasYear = hasOwnProperty(req.body, "year");
      const hasGenre = hasOwnProperty(req.body, "genre");

      if (!hasTitle && !hasArtist && !hasAlbum && !hasYear && !hasGenre) {
        return next(new AppError("At least one metadata field is required: title, artist, album, year, genre", 400));
      }

      const parsedTitle = hasTitle ? parseMetadataField(req.body?.title) : undefined;
      const parsedArtist = hasArtist ? parseMetadataField(req.body?.artist) : undefined;
      const parsedAlbum = hasAlbum ? parseMetadataField(req.body?.album) : undefined;
      const parsedYear = hasYear ? parseMetadataYearField(req.body?.year) : undefined;
      const parsedGenre = hasGenre ? parseMetadataGenreField(req.body?.genre) : undefined;

      if (parsedTitle === null) return next(new AppError("title must be a string or null", 400));
      if (parsedArtist === null) return next(new AppError("artist must be a string or null", 400));
      if (parsedAlbum === null) return next(new AppError("album must be a string or null", 400));
      if (parsedYear === null) return next(new AppError("year must be an integer between 1000 and 2999, or null", 400));
      if (parsedGenre === null) return next(new AppError("genre must be an array of strings or null", 400));

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
        return next(new AppError("Track id is required", 400));
      }

      const track = indexStore.getTrackById(trackId);
      if (!track) {
        return next(new AppError("Track not found", 404));
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
        return next(new AppError("Artist is required", 400));
      }

      const ownerNamesById = getOwnerNamesById();
      const filter = readFilter(req.query as Record<string, unknown>);
      const indexedTracks = selectIndexedTracks(indexStore, { owner: filter.owner }, ownerNamesById);
      const tracksWithOwnerNames = mapTrackOwners(indexedTracks, ownerNamesById);
      const matchedArtist = listArtists(tracksWithOwnerNames).find(
        (entry) => entry.normalizedName === normalizedArtist
      );
      const artistNameLower = matchedArtist?.name.trim().toLowerCase();
      const tracksForArtist = tracksWithOwnerNames.filter((track) => {
        if (getTrackArtistDirectorySegment(track) === normalizedArtist) {
          return true;
        }
        const primaryArtist = getTrackArtistName(track)?.trim().toLowerCase();
        if (!primaryArtist) {
          return false;
        }
        if (primaryArtist === normalizedArtist) {
          return true;
        }
        return Boolean(artistNameLower) && primaryArtist === artistNameLower;
      });
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
        return next(new AppError("Album id is required", 400));
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
          return next(new AppError("Album not found", 404));
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
        return next(new AppError("Album not found", 404));
      }

      albumTracks.sort(compareAlbumTrackOrder);
      res.json(buildAlbumResponse(albumId, albumName, cover, albumTracks));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
