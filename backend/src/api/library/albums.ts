import path from "node:path";

import { Router } from "express";

import { requireAuth } from "../../auth/middleware";
import type { IndexStore } from "../../services/indexer/indexStore";
import { filterTracks } from "../../services/indexer/libraryQuery";
import {
  attachCollaborativeAlbumCovers,
  compareAlbumTrackOrder,
  normalizeAlbumName,
  parseCollaborativeAlbumId,
  resolveAlbumMetadataForTrack,
  type ResolvedAlbumMetadata
} from "../../services/library/libraryMediaResolver";
import type { Track } from "../../types/library";
import { AppError } from "../../utils/AppError";
import { resolveDataRelativePath } from "../../utils/paths";
import { readFilter } from "../queryParsers";
import {
  getOwnerNamesById,
  mapTrackOwners,
  selectIndexedTracks
} from "../trackPipeline";
import { buildAlbumResponse } from "./helpers";

export function createAlbumRouter(indexStore: IndexStore): Router {
  const router = Router();

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
