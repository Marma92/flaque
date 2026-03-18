import { Router } from "express";

import { IndexStore } from "../services/indexer/indexStore";
import { createActivityRouter } from "./activityRoutes";
import { createAuthRouter } from "./authRoutes";
import { createCoverRouter } from "./coverRoutes";
import { createIndexRouter } from "./indexRoutes";
import { createLibraryRouter } from "./libraryRoutes";
import { createPlaylistRouter } from "./playlistRoutes";
import { createStreamingRouter } from "./streamingRoutes";
import { createUploadRouter } from "./uploadRoutes";
import { createUserRouter } from "./userRoutes";

export function createApiRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.use("/auth", createAuthRouter());
  router.use(createActivityRouter(indexStore));
  router.use(createUploadRouter(indexStore));
  router.use(createLibraryRouter(indexStore));
  router.use(createPlaylistRouter());
  router.use(createStreamingRouter(indexStore));
  router.use(createCoverRouter());
  router.use(createIndexRouter(indexStore));
  router.use(createUserRouter());

  return router;
}
