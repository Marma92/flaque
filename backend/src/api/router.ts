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
import { createServerRouter } from "./serverRoutes";
import { createUnifiedPlaylistRouter } from "./unifiedPlaylistRoutes";
import { createRadioRouter } from "./radioRoutes";
import { createStreamingRouter } from "./streamingRoutes";
import { createUploadRouter } from "./uploadRoutes";
import { createUserRouter } from "./userRoutes";
import { errorHandler } from "../middleware/errorHandler";

export function createApiRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.use("/auth", createAuthRouter());
  router.use(createUploadRouter(indexStore));
  router.use(createLibraryRouter(indexStore));
  router.use("/playlists", createUnifiedPlaylistRouter(indexStore));
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

  // Global error handler
  router.use(errorHandler);

  return router;
}
