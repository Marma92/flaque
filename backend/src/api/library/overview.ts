import { Router } from "express";

import { requireAuth } from "../../auth/middleware";
import type { IndexStore } from "../../services/indexer/indexStore";
import { listAlbums, listArtists, listOwners } from "../../services/indexer/libraryQuery";
import { filterPlayablePlaylists } from "../../services/playlists/playlistStore";
import { readFilter } from "../queryParsers";
import {
  getOwnerNamesById,
  mapTrackResponse,
  resolveFilteredTracks
} from "../trackPipeline";

export function createLibraryOverviewRouter(indexStore: IndexStore): Router {
  const router = Router();

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

  return router;
}
