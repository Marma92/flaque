/**
 * Pure scoring helpers for For You peer ranking. No I/O, no side effects —
 * everything here is unit-testable in isolation. The ranker turns a candidate
 * track into a score by combining genre overlap, year proximity, library
 * popularity, novelty, and an album-overlap penalty.
 */

import { normalizeGenreLabel } from "../genre/genreSynonymService";

export type CandidateFeatures = {
  genreOverlap: number;
  yearProximity: number;
  libraryPopularity: number;
  novelty: number;
  albumOverlapWithSeed: number;
  recentSkipCount: number;
  /**
   * Cosine similarity between the candidate's audio embedding and the mean
   * embedding of the seed tracks. Range -1..1; 0.5 is the neutral value used
   * when either side is missing an embedding.
   */
  embeddingSimilarity: number;
};

export type RankerWeights = {
  genreOverlap: number;
  yearProximity: number;
  libraryPopularity: number;
  novelty: number;
  albumOverlapWithSeed: number;
  skipPenalty: number;
  embeddingSimilarity: number;
};

/**
 * CLAP-aware weights (phase 4, 2026-05). With semantic audio embeddings
 * landing in v3 sidecars, the relevance signal shifts from tag-overlap to
 * learned audio similarity. Genre/year become coarse safety rails;
 * embedding cosine is the primary fit signal.
 */
export const CLAP_WEIGHTS: RankerWeights = {
  genreOverlap: 0.25,
  yearProximity: 0.10,
  libraryPopularity: 0.15,
  novelty: 0.15,
  albumOverlapWithSeed: -0.30,
  skipPenalty: -0.20,
  embeddingSimilarity: 0.40
};

/**
 * Legacy weights, used when AI recommendation is disabled and embeddings
 * fall back to the 32-dim MFCC pipeline. MFCCs capture timbre but not
 * musical structure, so we can only trust them at a small weight; genre
 * and year carry the rest of the load.
 */
export const MFCC_WEIGHTS: RankerWeights = {
  genreOverlap: 0.40,
  yearProximity: 0.20,
  libraryPopularity: 0.15,
  novelty: 0.15,
  albumOverlapWithSeed: -0.30,
  skipPenalty: -0.20,
  embeddingSimilarity: 0.10
};

/** Default = AI on. Setting flips the active preset at generation time. */
export const DEFAULT_WEIGHTS: RankerWeights = CLAP_WEIGHTS;

/** Neutral similarity score when an embedding is unavailable. */
export const NEUTRAL_EMBEDDING_SIMILARITY = 0.5;

/**
 * Hard filter excludes tracks at >= SKIP_HARD_FILTER_THRESHOLD skips. The
 * soft cap shapes the penalty curve for tracks that survive the filter:
 * each additional skip below the cap deepens the penalty, then plateaus.
 * Keep hard > soft so the cap actually does work.
 */
export const SKIP_SOFT_CAP = 3;
export const SKIP_HARD_FILTER_THRESHOLD = 5;

export const YEAR_SIGMA = 8;
export const JITTER_RANGE = 0.1;

/** Jaccard similarity between candidate genres and the seed's normalized genre set. */
export function genreJaccard(candidateGenres: string[], seedGenres: ReadonlySet<string>): number {
  if (candidateGenres.length === 0 || seedGenres.size === 0) return 0;
  const candidateSet = new Set<string>();
  for (const g of candidateGenres) {
    candidateSet.add(normalizeGenreLabel(g).toLowerCase());
  }

  let intersection = 0;
  for (const g of candidateSet) {
    if (seedGenres.has(g)) intersection++;
  }
  const union = candidateSet.size + seedGenres.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Gaussian centered on the seed era's mid-year. Returns 0..1. Year-less tracks get a small neutral score. */
export function yearProximity(
  year: number | undefined,
  midYear: number,
  sigma: number = YEAR_SIGMA
): number {
  if (!year) return 0.3;
  const diff = year - midYear;
  return Math.exp(-(diff * diff) / (2 * sigma * sigma));
}

/** Log-scaled popularity: 0 if never played, 1 at the most-played artist/track in the user's library. */
export function logPopularity(plays: number, maxPlays: number): number {
  if (maxPlays <= 0 || plays <= 0) return 0;
  return Math.log(1 + plays) / Math.log(1 + maxPlays);
}

/** Penalize tracks the user has played heavily in the recency window. */
export function noveltyScore(recentPlays: number): number {
  if (recentPlays <= 0) return 1;
  return 1 / (1 + recentPlays);
}

/**
 * 32-bit FNV-1a hash mapped into a small symmetric range so two regenerations
 * with identical inputs produce identical playlists, but day-to-day variation
 * still shifts ordering slightly. Deterministic per (userId, seed, trackId).
 */
export function fnvJitter(seed: string, range: number = JITTER_RANGE): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const norm = hash / 0x100000000;
  return (norm - 0.5) * range;
}

export function scoreFeatures(features: CandidateFeatures, weights: RankerWeights = DEFAULT_WEIGHTS): number {
  const cappedSkips = Math.min(features.recentSkipCount, SKIP_SOFT_CAP);
  return (
    weights.genreOverlap * features.genreOverlap +
    weights.yearProximity * features.yearProximity +
    weights.libraryPopularity * features.libraryPopularity +
    weights.novelty * features.novelty +
    weights.albumOverlapWithSeed * features.albumOverlapWithSeed +
    weights.skipPenalty * cappedSkips +
    weights.embeddingSimilarity * features.embeddingSimilarity
  );
}
