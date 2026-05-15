/**
 * Interactive for-you regeneration + summary.
 *
 * Usage:
 *   npm run for-you:regen                  # all users
 *   npm run for-you:regen -- <userId>      # one user
 *
 * Loads the index, runs regenerateForYouPlaylists for each target user,
 * and prints a compact summary of the resulting playlists with track
 * titles. Useful for operator inspection after a ranker change or a
 * fresh backfill, without spinning up the full server.
 *
 * Already idempotent: the regenerator overwrites the user's prior set
 * and trace files atomically.
 */
import process from "node:process";

import { listUsers } from "../auth/db";
import { initializeAuthDatabase } from "../auth/dbConnection";
import { IndexStore } from "../services/indexer/indexStore";
import { regenerateForYouPlaylists } from "../services/playlists/forYou/regenerate";

type TrackLite = { id: string; title: string; artist: string };

function summariseTracks(indexStore: IndexStore, trackIds: string[]): TrackLite[] {
  return trackIds
    .map((id) => indexStore.getTrackById(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => ({
      id: t.id,
      title: t.tags.title ?? "Untitled",
      artist: t.tags.artist ?? "Unknown artist"
    }));
}

async function regenerateForUser(userId: string, indexStore: IndexStore): Promise<void> {
  console.log(`\n=== user ${userId} ===`);
  const playlists = await regenerateForYouPlaylists(userId, indexStore);
  if (playlists.length === 0) {
    console.log("  (no playlists generated — check below-min-plays / below-min-artists / dismissals)");
    return;
  }

  for (const playlist of playlists) {
    console.log(`\n  ▶ ${playlist.name}  [${playlist.trackCount} tracks, score=${playlist.score?.toFixed(2) ?? "?"}]`);
    const tracks = summariseTracks(indexStore, playlist.trackIds);
    for (const t of tracks) {
      console.log(`     · ${t.artist} — ${t.title}`);
    }
  }
}

async function main(): Promise<void> {
  const argUserId = process.argv[2];

  initializeAuthDatabase();
  const indexStore = new IndexStore();
  await indexStore.initialize();
  if (indexStore.getSnapshot().totalTracks === 0) {
    console.log("[for-you] index empty; rebuilding from disk first");
    await indexStore.rebuild();
  }

  const targets = argUserId ? [{ id: argUserId }] : listUsers();
  if (targets.length === 0) {
    console.error("[for-you] no users to regenerate for");
    process.exit(1);
  }

  for (const user of targets) {
    try {
      await regenerateForUser(user.id, indexStore);
    } catch (error) {
      console.error(`[for-you] user ${user.id} regen failed:`, error);
    }
  }
}

void main().catch((error) => {
  console.error("[for-you] unexpected error", error);
  process.exit(99);
});
