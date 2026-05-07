import { createLogger } from "../../../utils/logger";
import type { IndexStore } from "../../indexer/indexStore";
import { generateForYouPlaylistsWithTrace } from "./generate";
import { loadForYouPlaylists, needsForYouRegeneration, saveForYouPlaylists, type ForYouPlaylist } from "./store";
import { saveForYouTrace } from "./trace";

const log = createLogger("for-you-playlists");

export async function regenerateForYouPlaylists(
  userId: string,
  indexStore: IndexStore
): Promise<ForYouPlaylist[]> {
  log.info(`Regenerating for-you playlists for user ${userId}...`);
  const { playlists, trace } = await generateForYouPlaylistsWithTrace(userId, indexStore);
  await saveForYouPlaylists(userId, playlists);
  await saveForYouTrace(userId, trace);

  const totalCandidates = trace.playlists.reduce((sum, p) => sum + p.candidatePoolSize, 0);
  const seeds = trace.seedSelection.chosen.join(",") || "(none)";
  log.info(
    `for-you: user=${userId} seeds=${seeds} playlists=${playlists.length} ` +
      `totalCandidates=${totalCandidates} durationMs=${trace.durationMs}`
  );
  return playlists;
}

export async function checkAndRegenerateForYouOnBoot(
  userId: string,
  indexStore: IndexStore
): Promise<void> {
  const shouldRegenerate = await needsForYouRegeneration(userId);
  if (!shouldRegenerate) {
    const existing = await loadForYouPlaylists(userId);
    log.debug(`For-you playlists up to date for user ${userId} (${existing.length} playlist(s))`);
    return;
  }

  await regenerateForYouPlaylists(userId, indexStore);
}
