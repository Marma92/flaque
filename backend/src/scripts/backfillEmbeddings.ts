/**
 * CLI hook for the audio-embedding backfill.
 *
 * Usage:
 *   npm run embed:backfill
 *
 * Loads the index, finds all tracks without a current-version embedding
 * sidecar, and computes one via the Python sidecar. Sequential — the
 * sidecar is single-threaded by design.
 *
 * The same backfill runs automatically on server start (see server.ts);
 * this CLI is for running it interactively after bumping EMBEDDING_VERSION
 * or after pointing AUDIO_EMBEDDER_URL at a different sidecar.
 *
 * Prerequisite: the sidecar must be running.
 *   ./python-services/audio-embedder/start.sh
 */
import process from "node:process";

import { backfillMissingEmbeddings } from "../services/embeddings/audioEmbeddingService";
import { pingEmbedder } from "../services/embeddings/embedderClient";
import { IndexStore } from "../services/indexer/indexStore";

async function main(): Promise<void> {
  const health = await pingEmbedder();
  if (!health) {
    console.error("[backfill] sidecar /healthz unreachable. Start it first:");
    console.error("[backfill]   ./python-services/audio-embedder/start.sh");
    process.exit(2);
  }
  console.log(`[backfill] sidecar healthy: model=${health.model}`);

  const indexStore = new IndexStore();
  await indexStore.initialize();
  if (indexStore.getSnapshot().totalTracks === 0) {
    console.log("[backfill] index empty; rebuilding from disk first");
    await indexStore.rebuild();
  }

  const tracks = indexStore.getSnapshot().tracks.map((t) => ({ id: t.id, path: t.path }));
  console.log(`[backfill] scanning ${tracks.length} tracks`);

  const result = await backfillMissingEmbeddings(tracks, { logEvery: 10 });
  console.log(
    `[backfill] done: computed=${result.computed} skipped=${result.skipped} failed=${result.failed}`
  );
}

void main().catch((error) => {
  console.error("[backfill] unexpected error", error);
  process.exit(99);
});
