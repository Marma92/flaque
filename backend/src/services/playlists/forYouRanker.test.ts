import { describe, expect, it, vi } from "vitest";

vi.mock("../genre/genreSynonymService", () => ({
  normalizeGenreLabel: (g: string) => g
}));

import {
  DEFAULT_WEIGHTS,
  fnvJitter,
  genreJaccard,
  logPopularity,
  noveltyScore,
  scoreFeatures,
  yearProximity,
  type CandidateFeatures
} from "./forYouRanker";

describe("forYouRanker", () => {
  describe("genreJaccard", () => {
    it("returns 0 when either side is empty", () => {
      expect(genreJaccard([], new Set(["rock"]))).toBe(0);
      expect(genreJaccard(["rock"], new Set())).toBe(0);
    });

    it("returns 1 for identical sets", () => {
      expect(genreJaccard(["Rock", "Pop"], new Set(["rock", "pop"]))).toBe(1);
    });

    it("returns the correct jaccard for partial overlap", () => {
      // candidate: {rock, jazz}; seed: {rock, pop} → intersection 1, union 3
      expect(genreJaccard(["Rock", "Jazz"], new Set(["rock", "pop"]))).toBeCloseTo(1 / 3);
    });
  });

  describe("yearProximity", () => {
    it("is 1 at the centre", () => {
      expect(yearProximity(1975, 1975)).toBeCloseTo(1);
    });

    it("decays with distance", () => {
      const close = yearProximity(1976, 1975);
      const far = yearProximity(1990, 1975);
      expect(close).toBeGreaterThan(far);
    });

    it("returns the neutral fallback when year is unknown", () => {
      expect(yearProximity(undefined, 1975)).toBe(0.3);
    });
  });

  describe("logPopularity", () => {
    it("returns 0 when plays are 0", () => {
      expect(logPopularity(0, 100)).toBe(0);
    });

    it("returns 1 when plays match the max", () => {
      expect(logPopularity(100, 100)).toBeCloseTo(1);
    });

    it("is monotonic in plays", () => {
      expect(logPopularity(5, 100)).toBeLessThan(logPopularity(50, 100));
    });
  });

  describe("noveltyScore", () => {
    it("is 1 when never recently played", () => {
      expect(noveltyScore(0)).toBe(1);
    });

    it("is monotonically decreasing in recent plays", () => {
      expect(noveltyScore(1)).toBeGreaterThan(noveltyScore(5));
    });
  });

  describe("fnvJitter", () => {
    it("is deterministic for the same seed", () => {
      expect(fnvJitter("user|seed|track")).toBe(fnvJitter("user|seed|track"));
    });

    it("differs across seeds", () => {
      expect(fnvJitter("a")).not.toBe(fnvJitter("b"));
    });

    it("stays inside the requested range", () => {
      const range = 0.1;
      for (const s of ["a", "long-input-here", "another", "track-42"]) {
        const j = fnvJitter(s, range);
        expect(j).toBeGreaterThanOrEqual(-range / 2);
        expect(j).toBeLessThanOrEqual(range / 2);
      }
    });
  });

  describe("scoreFeatures monotonicity", () => {
    function baseFeatures(): CandidateFeatures {
      return {
        genreOverlap: 0.5,
        yearProximity: 0.5,
        libraryPopularity: 0.5,
        novelty: 0.5,
        albumOverlapWithSeed: 0
      };
    }

    it("increases with genreOverlap", () => {
      const lo = { ...baseFeatures(), genreOverlap: 0.1 };
      const hi = { ...baseFeatures(), genreOverlap: 0.9 };
      expect(scoreFeatures(hi)).toBeGreaterThan(scoreFeatures(lo));
    });

    it("increases with yearProximity", () => {
      const lo = { ...baseFeatures(), yearProximity: 0.1 };
      const hi = { ...baseFeatures(), yearProximity: 0.9 };
      expect(scoreFeatures(hi)).toBeGreaterThan(scoreFeatures(lo));
    });

    it("increases with libraryPopularity", () => {
      const lo = { ...baseFeatures(), libraryPopularity: 0.1 };
      const hi = { ...baseFeatures(), libraryPopularity: 0.9 };
      expect(scoreFeatures(hi)).toBeGreaterThan(scoreFeatures(lo));
    });

    it("increases with novelty", () => {
      const lo = { ...baseFeatures(), novelty: 0.1 };
      const hi = { ...baseFeatures(), novelty: 0.9 };
      expect(scoreFeatures(hi)).toBeGreaterThan(scoreFeatures(lo));
    });

    it("decreases when albumOverlapWithSeed is set", () => {
      const off = { ...baseFeatures(), albumOverlapWithSeed: 0 };
      const on = { ...baseFeatures(), albumOverlapWithSeed: 1 };
      expect(scoreFeatures(on)).toBeLessThan(scoreFeatures(off));
    });

    it("uses the documented default weights", () => {
      expect(DEFAULT_WEIGHTS.genreOverlap).toBe(0.4);
      expect(DEFAULT_WEIGHTS.albumOverlapWithSeed).toBeLessThan(0);
    });
  });
});
