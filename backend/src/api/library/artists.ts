import { Router } from "express";

import { requireAuth } from "../../auth/middleware";
import type { IndexStore } from "../../services/indexer/indexStore";
import { filterTracks, listArtists } from "../../services/indexer/libraryQuery";
import {
  attachArtistPhotos,
  attachCollaborativeAlbumCovers,
  getTrackArtistName
} from "../../services/library/libraryMediaResolver";
import { AppError } from "../../utils/AppError";
import { readFilter } from "../queryParsers";
import {
  getOwnerNamesById,
  mapTrackOwners,
  selectIndexedTracks
} from "../trackPipeline";
import { getTrackArtistDirectorySegment } from "./helpers";

export function createArtistRouter(indexStore: IndexStore): Router {
  const router = Router();

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

  router.get("/artists/:artist/albums", requireAuth, async (req, res, next) => {
    try {
      const normalizedArtist = req.params.artist?.trim().toLowerCase();
      if (!normalizedArtist) {
        return next(new AppError("Artist is required", 400, "artist"));
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

  return router;
}
