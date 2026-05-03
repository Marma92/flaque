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
};

export type RankerWeights = {
  genreOverlap: number;
  yearProximity: number;
  libraryPopularity: number;
  novelty: number;
  albumOverlapWithSeed: number;
  skipPenalty: number;
};

export const DEFAULT_WEIGHTS: RankerWeights = {
  genreOverlap: 0.40,
  yearProximity: 0.20,
  libraryPopularity: 0.15,
  novelty: 0.15,
  albumOverlapWithSeed: -0.30,
  skipPenalty: -0.20
};

export const SKIP_SOFT_CAP = 3;
export const SKIP_HARD_FILTER_THRESHOLD = 3;

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
    weights.skipPenalty * cappedSkips
  );
}
