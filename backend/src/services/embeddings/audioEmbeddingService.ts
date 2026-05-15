/**
 * Audio embedding service — orchestration layer.
 *
 * Delegates decoding + model inference to the Python sidecar
 * (`python-services/audio-embedder/`). This file owns the on-disk format,
 * the version gate, and the backfill loop.
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
import { EMBEDDING_DIM, EMBEDDING_VERSION } from "./audioFeatures";
import { requestEmbedding } from "./embedderClient";

const log = createLogger("audio-embeddings");

export const EMBEDDINGS_DIR = path.join(dataRoot, "embeddings");

export type AudioEmbedding = {
  trackId: string;
  version: number;
  computedAt: string;
  vec: number[];
};

function embeddingPath(trackId: string): string {
  return path.join(EMBEDDINGS_DIR, `${trackId}.json`);
}

// ── Storage ───────────────────────────────────────────────────────

export async function loadEmbedding(trackId: string): Promise<AudioEmbedding | null> {
  const data = await readJsonFile<AudioEmbedding>(
    embeddingPath(trackId),
    null as unknown as AudioEmbedding
  );
  if (!data || !Array.isArray(data.vec) || data.vec.length !== EMBEDDING_DIM) return null;
  if (data.version !== EMBEDDING_VERSION) return null;
  return data;
}

export async function saveEmbedding(embedding: AudioEmbedding): Promise<void> {
  await ensureDir(EMBEDDINGS_DIR);
  await writeJsonAtomic(embeddingPath(embedding.trackId), embedding);
}

// ── Compute via sidecar ───────────────────────────────────────────

/** Compute and persist an embedding for a track. Returns null on any failure. */
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

  const response = await requestEmbedding(absolutePath);
  if (!response) {
    // Client already logged the underlying reason.
    return null;
  }

  if (response.vec.length !== EMBEDDING_DIM) {
    log.warn("Embedder returned unexpected dimension", {
      trackId,
      got: response.vec.length,
      want: EMBEDDING_DIM
    });
    return null;
  }

  const embedding: AudioEmbedding = {
    trackId,
    version: EMBEDDING_VERSION,
    computedAt: new Date().toISOString(),
    vec: response.vec
  };
  await saveEmbedding(embedding);
  return embedding;
}

export async function hasEmbedding(trackId: string): Promise<boolean> {
  const existing = await loadEmbedding(trackId);
  return existing !== null;
}

// ── Backfill ──────────────────────────────────────────────────────

/**
 * Background backfill: compute embeddings for any track that doesn't have
 * one at the current version yet. Sequential — the sidecar handles its own
 * threading, and we'd rather not flood it with concurrent requests for a
 * one-time backfill.
 */
export async function backfillMissingEmbeddings(
  tracks: Array<{ id: string; path: string }>,
  options: { logEvery?: number } = {}
): Promise<{ computed: number; skipped: number; failed: number }> {
  const logEvery = options.logEvery ?? 50;
  let computed = 0;
  let skipped = 0;
  let failed = 0;

  // Build a Set of trackIds that already have a current-version sidecar.
  // We readdir once (avoiding stat-per-track for tracks that lack a file)
  // and then read only the existing sidecars to drop stale-version ones.
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
