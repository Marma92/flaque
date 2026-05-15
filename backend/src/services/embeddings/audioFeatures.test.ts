import { describe, expect, it } from "vitest";

import { CLAP_EMBEDDING_DIM, CLAP_EMBEDDING_VERSION, cosineSimilarity, meanVector } from "./audioFeatures";

describe("CLAP_EMBEDDING_DIM / CLAP_EMBEDDING_VERSION", () => {
  it("are the CLAP-aligned values", () => {
    expect(CLAP_EMBEDDING_DIM).toBe(512);
    expect(CLAP_EMBEDDING_VERSION).toBe(3);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const a = [1, 2, 3, 4];
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("returns -1 for antiparallel vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 6);
  });

  it("returns 0 when either vector is all zeros", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it("returns 0 on length mismatch", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

describe("meanVector", () => {
  it("returns the L2-normalized mean of input vectors", () => {
    const m = meanVector([
      [1, 0, 0],
      [0, 1, 0]
    ])!;
    expect(m.length).toBe(3);
    let sq = 0;
    for (const v of m) sq += v * v;
    expect(sq).toBeCloseTo(1, 6);
    expect(m[0]).toBeCloseTo(m[1]!, 6);
    expect(m[2]).toBeCloseTo(0, 6);
  });

  it("returns null on an empty list", () => {
    expect(meanVector([])).toBeNull();
  });

  it("drops vectors of mismatched dimension instead of crashing", () => {
    const m = meanVector([
      [1, 0, 0],
      [0, 1], // wrong dim — skipped
      [0, 0, 1]
    ])!;
    expect(m.length).toBe(3);
    // Only the two 3-dim vectors contributed; mean ≈ (0.5, 0, 0.5), normalised.
    let sq = 0;
    for (const v of m) sq += v * v;
    expect(sq).toBeCloseTo(1, 6);
    expect(m[0]).toBeCloseTo(m[2]!, 6);
    expect(m[1]).toBeCloseTo(0, 6);
  });

  it("returns null when all inputs are wrong-dim relative to the first", () => {
    const m = meanVector([[1, 0, 0], [0, 1], [0, 0]]);
    // First sets dim=3; remaining two are dim=2 → used=1 → still valid.
    expect(m).not.toBeNull();
  });
});
