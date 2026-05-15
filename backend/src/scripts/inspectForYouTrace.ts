/**
 * Pretty-printer for the for-you trace files.
 *
 * Usage:
 *   npm run for-you:inspect                # all users with a saved trace
 *   npm run for-you:inspect -- <userId>    # one user
 *
 * Surfaces, per playlist:
 *   - Ranker snapshot (weights + embedding version) so picks stay
 *     interpretable across weight tweaks.
 *   - Seed selection: which artists were chosen, which were skipped, why.
 *   - Top picks with per-feature contributions (embedding cosine is the
 *     primary signal post-phase-4, so it's the leftmost numeric column).
 *   - Top rejections with the same breakdown.
 *
 * Read-only — opens trace JSON files on disk via loadForYouTrace, does not
 * touch the index store or the running server.
 */
import process from "node:process";

import { listUsers } from "../auth/db";
import { initializeAuthDatabase } from "../auth/dbConnection";
import { IndexStore } from "../services/indexer/indexStore";
import type { ForYouPlaylistTrace, ForYouTrace, ScoredTrackTrace } from "../services/playlists/playlistTrace";
import { loadForYouTrace } from "../services/playlists/forYou/trace";

function fmtScore(n: number): string {
  const sign = n >= 0 ? " " : "-";
  return `${sign}${Math.abs(n).toFixed(2)}`;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function trackLabel(indexStore: IndexStore, entry: ScoredTrackTrace): string {
  const t = indexStore.getTrackById(entry.trackId);
  const title = t?.tags.title ?? "(missing)";
  const artist = t?.tags.artist ?? entry.artist;
  return `${artist} — ${title}`;
}

function printRankerHeader(trace: ForYouTrace): void {
  if (!trace.ranker) {
    console.log("  ranker: (snapshot not captured; trace pre-dates phase 5)");
    return;
  }
  const w = trace.ranker.weights;
  console.log(
    `  ranker: emb=${w.embeddingSimilarity}  genre=${w.genreOverlap}  ` +
      `year=${w.yearProximity}  novelty=${w.novelty}  pop=${w.libraryPopularity}  ` +
      `(embedding v${trace.ranker.embeddingVersion}, ${trace.ranker.embeddingDim}-dim)`
  );
  const f = trace.ranker.candidateFilters;
  if (f) {
    const parts = Object.entries(f).map(([k, v]) => `${k}=${v}`);
    console.log(`  pre-rank filters: ${parts.join("  ")}`);
  }
}

function printSeeds(trace: ForYouTrace): void {
  const sel = trace.seedSelection;
  const chosen = new Set(sel.chosen);
  console.log(`\n  Seeds (${sel.chosen.length} chosen, ${sel.skipped.length} skipped):`);
  for (const c of sel.candidates.slice(0, 8)) {
    const mark = chosen.has(c.artist) ? "✓" : " ";
    console.log(
      `    ${mark} ${c.artist.padEnd(28)} score=${c.score.toFixed(2).padStart(6)}  ` +
        `sources=${c.sources.join(",")}`
    );
  }
  for (const s of sel.skipped) {
    console.log(`    ✗ ${s.artist.padEnd(28)} skipped (${s.reason})`);
  }
}

function printPlaylist(playlist: ForYouPlaylistTrace, indexStore: IndexStore): void {
  console.log(
    `\n  ▶ "${playlist.playlistName ?? `(seed: ${playlist.seed})`}"` +
      `   ${playlist.finalTrackIds.length} tracks · ${playlist.candidatePoolSize} candidates`
  );
  if (playlist.rejection) {
    console.log(`    rejected: ${playlist.rejection}`);
    return;
  }

  const finalOrder = playlist.finalOrder ?? [];
  if (finalOrder.length === 0) {
    console.log("    (no per-track trace available)");
    return;
  }

  const picks = finalOrder;
  const featureAverages = {
    emb: mean(picks.map((p) => p.features.embeddingSimilarity)),
    genre: mean(picks.map((p) => p.features.genreOverlap)),
    year: mean(picks.map((p) => p.features.yearProximity)),
    novelty: mean(picks.map((p) => p.features.novelty))
  };
  console.log(
    `    picked averages:  emb=${featureAverages.emb.toFixed(2)}  ` +
      `genre=${featureAverages.genre.toFixed(2)}  ` +
      `year=${featureAverages.year.toFixed(2)}  ` +
      `novelty=${featureAverages.novelty.toFixed(2)}`
  );

  console.log("    top picks (by raw score):");
  const topPicks = [...picks].sort((a, b) => b.score - a.score).slice(0, 5);
  for (let i = 0; i < topPicks.length; i++) {
    const p = topPicks[i]!;
    const f = p.features;
    console.log(
      `      #${(i + 1).toString().padStart(2)} ` +
        `${trackLabel(indexStore, p).padEnd(60).slice(0, 60)}  ` +
        `score=${fmtScore(p.score)}  ` +
        `emb=${f.embeddingSimilarity.toFixed(2)}  ` +
        `genre=${f.genreOverlap.toFixed(2)}  ` +
        `year=${f.yearProximity.toFixed(2)}  ` +
        `src=${p.source ?? "-"}`
    );
  }

  const rejections = playlist.topRejections ?? [];
  if (rejections.length > 0) {
    console.log("    top rejections:");
    for (const r of rejections.slice(0, 3)) {
      const f = r.features;
      console.log(
        `      -- ${trackLabel(indexStore, r).padEnd(60).slice(0, 60)}  ` +
          `score=${fmtScore(r.score)}  ` +
          `emb=${f.embeddingSimilarity.toFixed(2)}  ` +
          `genre=${f.genreOverlap.toFixed(2)}  ` +
          `reason=${r.rejection ?? "-"}`
      );
    }
  }
}

async function inspectUser(userId: string, indexStore: IndexStore): Promise<void> {
  console.log(`\n=== user ${userId} ===`);
  const trace = await loadForYouTrace(userId);
  if (!trace) {
    console.log("  (no trace on disk — has for-you regenerated for this user?)");
    return;
  }

  console.log(
    `  generated ${trace.generatedAt}  duration=${trace.durationMs}ms  ` +
      `${trace.totalPlays} plays  ${trace.distinctArtists} distinct artists`
  );
  if (trace.skipReason) {
    console.log(`  skipped: ${trace.skipReason}`);
    return;
  }
  printRankerHeader(trace);
  printSeeds(trace);

  for (const playlist of trace.playlists) {
    printPlaylist(playlist, indexStore);
  }
}

async function main(): Promise<void> {
  const argUserId = process.argv[2];

  initializeAuthDatabase();
  const indexStore = new IndexStore();
  await indexStore.initialize();
  if (indexStore.getSnapshot().totalTracks === 0) {
    await indexStore.rebuild();
  }

  const targets = argUserId ? [{ id: argUserId }] : listUsers();
  if (targets.length === 0) {
    console.error("[for-you] no users");
    process.exit(1);
  }

  for (const user of targets) {
    try {
      await inspectUser(user.id, indexStore);
    } catch (error) {
      console.error(`[for-you] user ${user.id} inspect failed:`, error);
    }
  }
}

void main().catch((error) => {
  console.error("[for-you] unexpected error", error);
  process.exit(99);
});
