import { Router } from "express";

import type { IndexStore } from "../services/indexer/indexStore";
import { createAutoPlaylistRouter } from "./playlist/automatic";
import { createPlaylistEngagementRouter } from "./playlist/engagement";
import { createForYouPlaylistRouter } from "./playlist/forYou";
import { createPersonalPlaylistRouter } from "./playlist/personal";
import { createUserPlaylistRouter } from "./playlist/userPlaylists";

/**
 * Playlist router with sub-path grouping:
 * - /playlists/automatic/* — auto-generated playlists
 * - /playlists/for-you/*   — personalized recommendation playlists
 * - /playlists/personal/*  — daily personal mixes
 * - /playlists/:id/*       — user-created and managed playlists
 *
 * Sub-router mount order is load-bearing: prefix-specific groups must come
 * before the user-CRUD router so its catch-all `/:id` does not shadow paths
 * like `/automatic`, `/for-you`, or `/personal`.
 */
export function createPlaylistRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.use(createAutoPlaylistRouter(indexStore));
  router.use(createForYouPlaylistRouter(indexStore));
  router.use(createPersonalPlaylistRouter(indexStore));
  router.use(createUserPlaylistRouter(indexStore));
  router.use(createPlaylistEngagementRouter(indexStore));

  return router;
}
