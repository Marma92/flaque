/**
 * Audio embedding service — orchestration layer.
 *
 * Two backends, chosen at runtime by the library setting `aiRecommendation`:
 *   - true  → CLAP via the Python sidecar (512-dim, v3 sidecars).
 *   - false → legacy in-process MFCC pipeline (32-dim, v2 sidecars).
 *
 * This file owns the on-disk format, the version gate, and the backfill
 * loop. The version stored in each sidecar tells us which model produced
 * it; if the user toggles modes, sidecars from the previous mode are
 * treated as missing and the backfill recomputes them with the new model.
 *
 * Storage:  data/embeddings/<trackId>.json
 * Shape:    { trackId, version, computedAt, vec: number[] }
 *
 * Embeddings are best-effort: a failure here never breaks the upload or
 * playlist generation. The ranker treats a missing embedding as a neutral
 * (skipped) feature.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { resolveTrackAbsolutePath } from "../storage/storageService";
import { dataRoot } from "../../utils/paths";
import { ensureDir, readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { createLogger } from "../../utils/logger";
import { getLibrarySettings } from "../librarySettings/librarySettings";
import { CLAP_EMBEDDING_DIM, CLAP_EMBEDDING_VERSION } from "./audioFeatures";
import {
  MFCC_EMBEDDING_DIM,
  MFCC_EMBEDDING_VERSION,
  computeMfccVector,
  decodeToPcm
} from "./mfccEmbedder";
import { requestEmbedding } from "./embedderClient";

const log = createLogger("audio-embeddings");

/** Directory holding per-track embedding sidecars (`<trackId>.json`). */
export const EMBEDDINGS_DIR = path.join(dataRoot, "embeddings");

/** On-disk shape for an embedding sidecar at `EMBEDDINGS_DIR/<trackId>.json`. */
export type AudioEmbedding = {
  trackId: string;
  /** Tag identifying which model produced the vector. See loadEmbedding. */
  version: number;
  computedAt: string;
  vec: number[];
};

/**
 * Snapshot of which embedding backend is currently active. Returned by
 * `getActiveEmbeddingProfile` and used by the ranker / trace builder to
 * record what produced the vectors it's about to consume.
 */
export type EmbeddingProfile = {
  /** Display label for logs + traces. */
  model: "clap" | "mfcc";
  /** Output dimension expected from this model's sidecars. */
  dim: number;
  /** On-disk version tag stamped into sidecars by this model. */
  version: number;
};

function embeddingPath(trackId: string): string {
  return path.join(EMBEDDINGS_DIR, `${trackId}.json`);
}

// ── Active profile ────────────────────────────────────────────────

/**
 * Resolve which embedding model is currently active. Read from the library
 * settings once per call site — settings change rarely, and the call sites
 * (backfill, regen, upload) are not in tight loops.
 */
export async function getActiveEmbeddingProfile(): Promise<EmbeddingProfile> {
  const settings = await getLibrarySettings();
  return settings.aiRecommendation
    ? { model: "clap", dim: CLAP_EMBEDDING_DIM, version: CLAP_EMBEDDING_VERSION }
    : { model: "mfcc", dim: MFCC_EMBEDDING_DIM, version: MFCC_EMBEDDING_VERSION };
}

// ── Storage ───────────────────────────────────────────────────────

/**
 * Load an embedding only if it matches the currently active model. Sidecars
 * left over from the other model are treated as missing — the backfill
 * loop will recompute them.
 */
export async function loadEmbedding(trackId: string): Promise<AudioEmbedding | null> {
  const profile = await getActiveEmbeddingProfile();
  const data = await readJsonFile<AudioEmbedding>(
    embeddingPath(trackId),
    null as unknown as AudioEmbedding
  );
  if (!data || !Array.isArray(data.vec) || data.vec.length !== profile.dim) return null;
  if (data.version !== profile.version) return null;
  return data;
}

/**
 * Write an embedding to disk atomically. Creates `EMBEDDINGS_DIR` on first
 * write. Callers are expected to set `version` to the active backend's
 * version constant — `saveEmbedding` does not enforce that, but
 * `loadEmbedding` will refuse to return the sidecar later if it doesn't
 * match the currently active model.
 */
export async function saveEmbedding(embedding: AudioEmbedding): Promise<void> {
  await ensureDir(EMBEDDINGS_DIR);
  await writeJsonAtomic(embeddingPath(embedding.trackId), embedding);
}

// ── Compute (dispatched) ──────────────────────────────────────────

async function computeViaClap(
  trackId: string,
  absolutePath: string
): Promise<AudioEmbedding | null> {
  const response = await requestEmbedding(absolutePath);
  if (!response) return null; // client already logged the reason
  if (response.vec.length !== CLAP_EMBEDDING_DIM) {
    log.warn("CLAP sidecar returned unexpected dimension", {
      trackId,
      got: response.vec.length,
      want: CLAP_EMBEDDING_DIM
    });
    return null;
  }
  return {
    trackId,
    version: CLAP_EMBEDDING_VERSION,
    computedAt: new Date().toISOString(),
    vec: response.vec
  };
}

async function computeViaMfcc(
  trackId: string,
  absolutePath: string
): Promise<AudioEmbedding | null> {
  try {
    const samples = await decodeToPcm(absolutePath);
    const vec = computeMfccVector(samples);
    if (!vec) {
      log.debug("Track too short for MFCC embedding", { trackId });
      return null;
    }
    return {
      trackId,
      version: MFCC_EMBEDDING_VERSION,
      computedAt: new Date().toISOString(),
      vec: Array.from(vec)
    };
  } catch (error) {
    log.warn("MFCC embedding failed", { trackId, error: String(error) });
    return null;
  }
}

/**
 * Compute and persist an embedding for a track using whichever backend is
 * currently active (CLAP sidecar or in-process MFCC). Returns the saved
 * embedding, or `null` on any failure — best-effort by design so an
 * upload or a backfill run never blocks on a single bad track.
 *
 * Failure modes (all swallowed and logged):
 *   - `resolveTrackAbsolutePath` rejects the relative path.
 *   - CLAP mode: sidecar unreachable, times out, malformed body.
 *   - MFCC mode: ffmpeg missing/failed, signal too short for one frame.
 */
export async function computeAndSaveEmbedding(
  trackId: string,
  trackRelativePath: string
): Promise<AudioEmbedding | null> {
  let absolutePath: string;
  try {
    absolutePath = resolveTrackAbsolutePath(trackRelativePath);
  } catch (error) {
    log.warn("Cannot resolve track path", { trackId, error: String(error) });
    return null;
  }

  const profile = await getActiveEmbeddingProfile();
  const embedding =
    profile.model === "clap"
      ? await computeViaClap(trackId, absolutePath)
      : await computeViaMfcc(trackId, absolutePath);

  if (!embedding) return null;
  await saveEmbedding(embedding);
  return embedding;
}

/** Convenience predicate: does a current-version sidecar exist for this track? */
export async function hasEmbedding(trackId: string): Promise<boolean> {
  const existing = await loadEmbedding(trackId);
  return existing !== null;
}

// ── Backfill ──────────────────────────────────────────────────────

/**
 * Background backfill: compute embeddings for any track that doesn't have
 * one at the current version yet. Sequential — whichever backend is active
 * (sidecar or local DSP) handles its own internal concurrency.
 */
export async function backfillMissingEmbeddings(
  tracks: Array<{ id: string; path: string }>,
  options: { logEvery?: number } = {}
): Promise<{ computed: number; skipped: number; failed: number }> {
  const logEvery = options.logEvery ?? 50;
  let computed = 0;
  let skipped = 0;
  let failed = 0;

  const profile = await getActiveEmbeddingProfile();

  await ensureDir(EMBEDDINGS_DIR);
  const validIds = new Set<string>();
  const entries = await fs.readdir(EMBEDDINGS_DIR).catch(() => [] as string[]);
  const existingFilenames = entries.filter((f) => f.endsWith(".json"));
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < 8; w++) {
    workers.push((async () => {
      while (true) {
        const i = cursor++;
        if (i >= existingFilenames.length) return;
        const id = existingFilenames[i]!.slice(0, -".json".length);
        if (await loadEmbedding(id)) validIds.add(id);
      }
    })());
  }
  await Promise.all(workers);

  log.info(
    `Embedding backfill starting (model=${profile.model}, v${profile.version}, ` +
      `${profile.dim}-dim): ${tracks.length} track(s), ${validIds.size} already current`
  );

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]!;
    if (validIds.has(track.id)) {
      skipped++;
      continue;
    }
    const result = await computeAndSaveEmbedding(track.id, track.path);
    if (result) computed++;
    else failed++;

    if ((i + 1) % logEvery === 0) {
      log.info(
        `Embedding backfill progress: ${i + 1}/${tracks.length} ` +
          `(computed=${computed} skipped=${skipped} failed=${failed})`
      );
    }
  }

  log.info(
    `Embedding backfill complete: computed=${computed} skipped=${skipped} failed=${failed}`
  );
  return { computed, skipped, failed };
}
