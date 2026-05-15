/**
 * CLAP embedding constants and generic vector-math helpers.
 *
 * Audio decoding + feature extraction live in the Python sidecar
 * (`python-services/audio-embedder/`). This file is the Node-side header:
 * the dimension/version constants that describe what the sidecar writes,
 * plus pure helpers (`cosineSimilarity`, `meanVector`) that work on any
 * vector regardless of which model produced it.
 *
 * The CLAP-specific constants are kept here for symmetry with
 * `mfccEmbedder.ts` (which exports the matching MFCC_* constants).
 * `audioEmbeddingService.ts` picks one or the other at runtime based on
 * the library setting.
 *
 * Bump `CLAP_EMBEDDING_VERSION` whenever the CLAP model or post-processing
 * changes — old sidecars on disk are no longer comparable. `loadEmbedding`
 * self-invalidates anything that doesn't match the currently active version.
 */

/** Output dimension of `laion/clap-htsat-fused` (audio tower projection). */
export const CLAP_EMBEDDING_DIM = 512;

/**
 * On-disk version tag for CLAP sidecars.
 *
 *   v1: legacy 32-dim hand-crafted MFCC + spectral stats (pre-versioning).
 *   v2: same 32-dim shape, scale-normalised so cosine is meaningful.
 *   v3: CLAP 512-dim audio embedding, produced by the Python sidecar.
 */
export const CLAP_EMBEDDING_VERSION = 3;

/**
 * Cosine similarity between two equal-length numeric vectors. Returns a
 * value in `[-1, 1]`; returns `0` for empty / mismatched-length / all-zero
 * inputs so callers never have to special-case those cases.
 */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let aSq = 0;
  let bSq = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    aSq += av * av;
    bSq += bv * bv;
  }
  const denom = Math.sqrt(aSq) * Math.sqrt(bSq);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Element-wise mean of the input vectors, then L2-normalised so cosine
 * similarity against the result stays a meaningful comparator.
 *
 * Robustness contract:
 *   - Returns `null` for an empty input list.
 *   - Vectors whose length doesn't match the first vector's length are
 *     silently dropped. If every subsequent vector is dropped, the mean
 *     is taken over what survived (including just the first vector).
 *   - Returns `null` if no vector survived the dim check.
 *
 * Dropping mismatched dims (rather than throwing) is what lets a mixed
 * v2 / v3 embedding period during a backfill produce *some* result
 * instead of crashing the regenerator.
 */
export function meanVector(vectors: ArrayLike<number>[]): Float32Array | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0]!.length;
  const out = new Float32Array(dim);
  let used = 0;
  for (const v of vectors) {
    if (v.length !== dim) continue;
    for (let i = 0; i < dim; i++) out[i] = out[i]! + v[i]!;
    used++;
  }
  if (used === 0) return null;
  for (let i = 0; i < dim; i++) out[i] = out[i]! / used;

  let sumSq = 0;
  for (let i = 0; i < dim; i++) sumSq += out[i]! * out[i]!;
  const norm = Math.sqrt(sumSq);
  if (norm < 1e-10) return out;
  for (let i = 0; i < dim; i++) out[i] = out[i]! / norm;
  return out;
}
