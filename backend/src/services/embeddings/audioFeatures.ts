/**
 * Embedding constants and vector-math helpers.
 *
 * Audio decoding + feature extraction live in the Python sidecar
 * (`python-services/audio-embedder/`). This file is what the Node-side
 * ranker uses to consume the persisted vectors.
 *
 * Bump EMBEDDING_VERSION whenever the producing model changes — old
 * sidecars on disk are no longer comparable. `loadEmbedding` self-
 * invalidates anything that doesn't match.
 */

/** 512-dim vectors from CLAP (`laion/clap-htsat-fused`). */
export const EMBEDDING_DIM = 512;

/**
 * v1: legacy 32-dim hand-crafted MFCC + spectral stats (pre-versioning).
 * v2: same shape, scale-normalised so cosine actually compared like with like.
 * v3: CLAP 512-dim audio embedding, produced by the Python sidecar.
 */
export const EMBEDDING_VERSION = 3;

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

/** Mean of a set of vectors, L2-normalized. Drops vectors of mismatched dim. */
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
