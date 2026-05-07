import { Router } from "express";

import type { IndexStore } from "../services/indexer/indexStore";
import { createAlbumRouter } from "./library/albums";
import { createArtistRouter } from "./library/artists";
import { createLibraryOverviewRouter } from "./library/overview";
import { createTrackMutationRouter } from "./library/trackAdmin";
import { createTrackQueryRouter } from "./library/tracks";

export function createLibraryRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.use(createLibraryOverviewRouter(indexStore));
  router.use(createTrackQueryRouter(indexStore));
  router.use(createTrackMutationRouter(indexStore));
  router.use(createArtistRouter(indexStore));
  router.use(createAlbumRouter(indexStore));

  return router;
}
