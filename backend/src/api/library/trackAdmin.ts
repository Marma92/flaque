import fs from "node:fs/promises";

import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { requireAdmin, requireAuth } from "../../auth/middleware";
import type { IndexStore } from "../../services/indexer/indexStore";
import {
  mergeTrackMetadataOverrides,
  readTrackMetadataOverrides
} from "../../services/indexer/metadataOverrideStore";
import { deleteTrackCover } from "../../services/storage/coverService";
import { resolveTrackAbsolutePath } from "../../services/storage/storageService";
import { AppError } from "../../utils/AppError";
import { createLogger } from "../../utils/logger";
import {
  hasOwnProperty,
  parseMetadataField,
  parseMetadataGenreField,
  parseMetadataYearField
} from "../queryParsers";
import {
  applyMetadataPatchToTrack,
  getOwnerNamesById,
  mapTrackOwners,
  mapTrackResponse
} from "../trackPipeline";

const log = createLogger("library");

export function createTrackMutationRouter(indexStore: IndexStore): Router {
  const router = Router();

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
      const deletedTitles: string[] = [];
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
        deletedTitles.push(track.tags.title ?? track.path);
      }

      if (Object.keys(overridePatch).length > 0) {
        await mergeTrackMetadataOverrides(overridePatch);
      }

      log.info("Tracks deleted in bulk", {
        userId: req.authUser?.id ?? "unknown",
        deletedCount: deleted.length,
        notFoundCount: notFound.length,
        titles: deletedTitles.slice(0, 10)
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
      const updatedTitles: string[] = [];
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
        updatedTitles.push(track.tags.title ?? track.path);
      }

      if (Object.keys(overridePatch).length > 0) {
        await mergeTrackMetadataOverrides(overridePatch);
      }

      log.info("Track metadata updated in bulk", {
        userId: req.authUser?.id ?? "unknown",
        updatedCount: updated.length,
        notFoundCount: notFound.length,
        fields: [hasTitle && "title", hasArtist && "artist", hasAlbum && "album", hasYear && "year", hasGenre && "genre"].filter(Boolean).join(", "),
        titles: updatedTitles.slice(0, 10)
      });

      await indexStore.rebuild();
      res.json({ updated, notFound });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/tracks/:id/metadata", requireAuth, requireAdmin, handlePatchTrackMetadata);
  router.patch("/tracks/:id", requireAuth, requireAdmin, handlePatchTrackMetadata);

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

  return router;
}
