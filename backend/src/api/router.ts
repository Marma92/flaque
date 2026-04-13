import { Router } from "express";

import { IndexStore } from "../services/indexer/indexStore";
import { createAuthRouter } from "./authRoutes";
import { createBackupRouter } from "./backupRoutes";
import { createCoverRouter } from "./coverRoutes";
import { createGenreRouter } from "./genreRoutes";
import { createIndexRouter } from "./indexRoutes";
import { createLibraryRouter } from "./libraryRoutes";
import { createLogRouter } from "./logRoutes";
import { createPlayCountRouter } from "./playCountRoutes";
import { createPlaylistRouter } from "./playlistRoutes";
import { createRadioRouter } from "./radioRoutes";
import { createServerRouter } from "./serverRoutes";
import { createStreamingRouter } from "./streamingRoutes";
import { createUploadRouter } from "./uploadRoutes";
import { createUserRouter } from "./userRoutes";

export function createApiRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.use("/auth", createAuthRouter());
  router.use(createUploadRouter(indexStore));
  router.use(createLibraryRouter(indexStore));
  router.use(createPlaylistRouter(indexStore));
  router.use(createRadioRouter(indexStore));
  router.use(createStreamingRouter(indexStore));
  router.use(createPlayCountRouter(indexStore));
  router.use(createCoverRouter(indexStore));
  router.use(createIndexRouter(indexStore));
  router.use(createGenreRouter(indexStore));
  router.use(createUserRouter());
  router.use(createLogRouter());
  router.use(createServerRouter());
  router.use(createBackupRouter());

  return router;
}
