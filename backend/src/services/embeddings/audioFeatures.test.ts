import { describe, expect, it } from "vitest";

import {
  EMBEDDING_DIM,
  FRAME_SIZE,
  HOP_SIZE,
  SAMPLE_RATE,
  computeFeatureVector,
  cosineSimilarity,
  fft,
  meanVector
} from "./audioFeatures";

function sineWave(freq: number, durationSec: number, amplitude = 0.7): Float32Array {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  }
  return out;
}

function whiteNoise(durationSec: number, amplitude = 0.3, seed = 1): Float32Array {
  const n = Math.floor(SAMPLE_RATE * durationSec);
  const out = new Float32Array(n);
  // Deterministic PRNG so tests are reproducible.
  let state = seed >>> 0;
  for (let i = 0; i < n; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = ((state / 0xffffffff) * 2 - 1) * amplitude;
  }
  return out;
}

describe("FFT", () => {
  it("recovers a known frequency bin from a sine wave", () => {
    // Sine at exactly bin 32 of a 1024-point FFT at 16kHz: 32 * 16000 / 1024 = 500Hz.
    const freq = 500;
    const real = new Float32Array(FRAME_SIZE);
    const imag = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) {
      real[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
    }
    fft(real, imag);

    const half = FRAME_SIZE / 2 + 1;
    let maxBin = 0;
    let maxMag = 0;
    for (let k = 0; k < half; k++) {
      const m = Math.sqrt(real[k]! * real[k]! + imag[k]! * imag[k]!);
      if (m > maxMag) {
        maxMag = m;
        maxBin = k;
      }
    }

    const dominantFreq = (maxBin * SAMPLE_RATE) / FRAME_SIZE;
    expect(Math.abs(dominantFreq - freq)).toBeLessThan(SAMPLE_RATE / FRAME_SIZE);
  });
});

describe("computeFeatureVector", () => {
  it("returns null on signals shorter than one frame", () => {
    const tiny = new Float32Array(FRAME_SIZE - 1);
    expect(computeFeatureVector(tiny)).toBeNull();
  });

  it("produces a vector of EMBEDDING_DIM that is L2-unit-normalized", () => {
    const sig = sineWave(1000, 1.0);
    const vec = computeFeatureVector(sig);
    expect(vec).not.toBeNull();
    expect(vec!.length).toBe(EMBEDDING_DIM);
    let sumSq = 0;
    for (const v of vec!) sumSq += v * v;
    expect(sumSq).toBeGreaterThan(0.99);
    expect(sumSq).toBeLessThan(1.01);
  });

  it("is deterministic for the same input", () => {
    const sig = sineWave(1500, 1.0);
    const a = computeFeatureVector(sig)!;
    const b = computeFeatureVector(sig)!;
    for (let i = 0; i < a.length; i++) {
      expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(1e-9);
    }
  });

  it("treats two close pure tones as more similar than tone vs. noise", () => {
    const tone1 = computeFeatureVector(sineWave(1000, 1.5))!;
    const tone2 = computeFeatureVector(sineWave(1100, 1.5))!;
    const noise = computeFeatureVector(whiteNoise(1.5))!;

    const toneToTone = cosineSimilarity(tone1, tone2);
    const toneToNoise = cosineSimilarity(tone1, noise);
    expect(toneToTone).toBeGreaterThan(toneToNoise);
  });

  it("uses HOP_SIZE worth of frames given a known signal length", () => {
    // Doesn't directly assert frame count, but exercises the boundary —
    // a signal exactly FRAME_SIZE long gives one frame.
    const oneFrame = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) {
      oneFrame[i] = Math.sin((2 * Math.PI * 800 * i) / SAMPLE_RATE);
    }
    const vec = computeFeatureVector(oneFrame);
    expect(vec).not.toBeNull();
    // With one frame, std dimensions should be ~0 (no variance).
    // MFCC stds are at indices 13..25.
    for (let i = 13; i < 26; i++) {
      expect(vec![i]!).toBeCloseTo(0, 5);
    }
    void HOP_SIZE; // referenced for clarity; constant is exported.
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
    // Mean direction is (0.5, 0.5, 0); after normalization, equal nonzero coords.
    expect(m[0]).toBeCloseTo(m[1]!, 6);
    expect(m[2]).toBeCloseTo(0, 6);
  });

  it("returns null on an empty list", () => {
    expect(meanVector([])).toBeNull();
  });
});
