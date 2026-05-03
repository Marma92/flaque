/**
 * Audio embedding service. Decodes a track via ffmpeg → 16 kHz mono PCM,
 * runs the DSP pipeline in audioFeatures.ts, and persists the resulting
 * 32-dim vector as a sidecar JSON next to the track's id.
 *
 * Storage:  data/embeddings/<trackId>.json
 * Shape:    { trackId, version, computedAt, vec: number[] }
 *
 * Embeddings are best-effort: a failure here never breaks the upload or
 * playlist generation. The ranker treats a missing embedding as a neutral
 * (skipped) feature.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { resolveTrackAbsolutePath } from "../storage/storageService";
import { dataRoot } from "../../utils/paths";
import { ensureDir, readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { createLogger } from "../../utils/logger";
import {
  EMBEDDING_DIM,
  EMBEDDING_VERSION,
  SAMPLE_RATE,
  computeFeatureVector
} from "./audioFeatures";

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

// ── Decode ────────────────────────────────────────────────────────

/**
 * Decode an audio file to mono 16 kHz Float32 PCM via ffmpeg. Returns the
 * raw samples as a Float32Array.
 *
 * Implementation note: ffmpeg's `f32le` output writes little-endian floats
 * to stdout. We accumulate buffers and reinterpret the final byte sequence
 * as a Float32Array, which on little-endian hosts is a zero-copy view.
 */
function decodeToPcm(absolutePath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-v", "error",
        "-i", absolutePath,
        "-vn",
        "-ac", "1",
        "-ar", String(SAMPLE_RATE),
        "-f", "f32le",
        "-"
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let stderr = "";

    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      totalBytes += chunk.length;
    });

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 4096) stderr = stderr.slice(-4096);
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`ffmpeg failed to start: ${err.message}`));
    });

    ffmpeg.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      // Buffer.concat's underlying ArrayBuffer offset isn't guaranteed to be
      // 4-byte aligned, which is required to construct a Float32Array view.
      // Copy bytes into a fresh, naturally aligned ArrayBuffer instead.
      const usable = totalBytes - (totalBytes % 4);
      const aligned = new ArrayBuffer(usable);
      const dst = new Uint8Array(aligned);
      let offset = 0;
      for (const chunk of chunks) {
        const remaining = usable - offset;
        if (remaining <= 0) break;
        const len = Math.min(chunk.length, remaining);
        dst.set(chunk.subarray(0, len), offset);
        offset += len;
      }
      resolve(new Float32Array(aligned));
    });
  });
}

// ── Concurrency control ───────────────────────────────────────────

const MAX_CONCURRENT = 2;
let active = 0;
const queue: Array<() => void> = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((r) => queue.push(r));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    const next = queue.shift();
    if (next) next();
  }
}

// ── Public API ────────────────────────────────────────────────────

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

  return withSlot(async () => {
    try {
      const samples = await decodeToPcm(absolutePath);
      const vec = computeFeatureVector(samples);
      if (!vec) {
        log.debug("Track too short for embedding", { trackId });
        return null;
      }
      const embedding: AudioEmbedding = {
        trackId,
        version: EMBEDDING_VERSION,
        computedAt: new Date().toISOString(),
        vec: Array.from(vec)
      };
      await saveEmbedding(embedding);
      return embedding;
    } catch (error) {
      log.warn("Embedding computation failed", { trackId, error: String(error) });
      return null;
    }
  });
}

export async function hasEmbedding(trackId: string): Promise<boolean> {
  const existing = await loadEmbedding(trackId);
  return existing !== null;
}

/**
 * Background backfill: compute embeddings for any track that doesn't have
 * one yet. Trickles through serially (modulo the concurrency slot) so it
 * doesn't dominate ffmpeg capacity that transcoding might want.
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
