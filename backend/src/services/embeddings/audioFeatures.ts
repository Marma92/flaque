/**
 * Lightweight DSP feature extraction for audio embeddings. Pure functions —
 * no I/O, no ffmpeg, just signal-in / vector-out. Kept separate from the
 * orchestration service so the math is unit-testable with synthetic signals.
 *
 * The pipeline takes a mono Float32Array at a known sample rate and returns
 * a fixed-length feature vector summarizing the track's timbre and dynamics:
 *
 *   13× MFCC mean
 *   13× MFCC std
 *    1× spectral centroid mean
 *    1× spectral centroid std
 *    1× spectral rolloff mean
 *    1× spectral flatness mean
 *    1× zero-crossing rate mean
 *    1× RMS mean
 *
 * 32-dimensional vector. Each dimension is L2-normalized at the end so that
 * cosine similarity is a meaningful comparator between two embeddings.
 */

export const SAMPLE_RATE = 16000;
export const FRAME_SIZE = 1024;
export const HOP_SIZE = 512;
export const NUM_MEL_FILTERS = 40;
export const NUM_MFCC_COEFFS = 13;
export const EMBEDDING_DIM = 32;
export const EMBEDDING_VERSION = 1;

// ── Window ─────────────────────────────────────────────────────────

const HANN = (() => {
  const w = new Float32Array(FRAME_SIZE);
  for (let i = 0; i < FRAME_SIZE; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME_SIZE - 1));
  }
  return w;
})();

// ── FFT (Cooley-Tukey, in-place radix-2) ──────────────────────────

export function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  // Bit-reverse permutation.
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tr = real[i]!;
      const ti = imag[i]!;
      real[i] = real[j]!;
      imag[i] = imag[j]!;
      real[j] = tr;
      imag[j] = ti;
    }
  }
  // Butterflies.
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const angleStep = (-2 * Math.PI) / size;
    for (let block = 0; block < n; block += size) {
      for (let k = 0; k < half; k++) {
        const angle = angleStep * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const idx = block + k;
        const jdx = idx + half;
        const tre = real[jdx]! * wr - imag[jdx]! * wi;
        const tim = real[jdx]! * wi + imag[jdx]! * wr;
        real[jdx] = real[idx]! - tre;
        imag[jdx] = imag[idx]! - tim;
        real[idx] = real[idx]! + tre;
        imag[idx] = imag[idx]! + tim;
      }
    }
  }
}

// ── Mel filterbank ────────────────────────────────────────────────

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

function buildMelFilterbank(
  numFilters: number,
  fftSize: number,
  sampleRate: number
): Float32Array[] {
  const halfFft = fftSize / 2 + 1;
  const melMin = hzToMel(0);
  const melMax = hzToMel(sampleRate / 2);
  const points: number[] = [];
  for (let i = 0; i <= numFilters + 1; i++) {
    points.push(melMin + ((melMax - melMin) * i) / (numFilters + 1));
  }
  const bins = points
    .map(melToHz)
    .map((hz) => Math.floor(((fftSize + 1) * hz) / sampleRate));

  const filters: Float32Array[] = [];
  for (let m = 1; m <= numFilters; m++) {
    const filter = new Float32Array(halfFft);
    const lo = bins[m - 1]!;
    const ce = bins[m]!;
    const hi = bins[m + 1]!;
    for (let k = lo; k < ce; k++) {
      filter[k] = ce === lo ? 0 : (k - lo) / (ce - lo);
    }
    for (let k = ce; k < hi; k++) {
      filter[k] = hi === ce ? 0 : (hi - k) / (hi - ce);
    }
    filters.push(filter);
  }
  return filters;
}

const MEL_FILTERS = buildMelFilterbank(NUM_MEL_FILTERS, FRAME_SIZE, SAMPLE_RATE);

// ── DCT-II (used to decorrelate the log-mel into MFCC) ────────────

function dctII(input: Float32Array, numCoeffs: number): Float32Array {
  const N = input.length;
  const out = new Float32Array(numCoeffs);
  const factor = Math.PI / N;
  for (let k = 0; k < numCoeffs; k++) {
    let sum = 0;
    for (let n = 0; n < N; n++) {
      sum += input[n]! * Math.cos(factor * (n + 0.5) * k);
    }
    out[k] = sum;
  }
  return out;
}

// ── Per-frame features ────────────────────────────────────────────

type FrameFeatures = {
  mfcc: Float32Array;
  centroid: number;
  rolloff: number;
  flatness: number;
  rms: number;
  zcr: number;
};

function frameFeatures(frame: Float32Array): FrameFeatures {
  const N = frame.length;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let i = 0; i < N; i++) real[i] = frame[i]! * HANN[i]!;
  fft(real, imag);

  const half = N / 2 + 1;
  const mag = new Float32Array(half);
  let totalEnergy = 0;
  for (let k = 0; k < half; k++) {
    const re = real[k]!;
    const im = imag[k]!;
    const m = Math.sqrt(re * re + im * im);
    mag[k] = m;
    totalEnergy += m;
  }

  // Spectral centroid (Hz, weighted by magnitude).
  let weightedFreq = 0;
  for (let k = 0; k < half; k++) {
    weightedFreq += ((k * SAMPLE_RATE) / N) * mag[k]!;
  }
  const centroid = totalEnergy > 0 ? weightedFreq / totalEnergy : 0;

  // Spectral rolloff (frequency under which 85% of energy lies).
  const rolloffThreshold = totalEnergy * 0.85;
  let cumulative = 0;
  let rolloff = SAMPLE_RATE / 2;
  for (let k = 0; k < half; k++) {
    cumulative += mag[k]!;
    if (cumulative >= rolloffThreshold) {
      rolloff = (k * SAMPLE_RATE) / N;
      break;
    }
  }

  // Spectral flatness (geometric mean / arithmetic mean of magnitude spectrum,
  // skipping DC). Pure tones → ~0, white noise → ~1.
  let logSum = 0;
  let arithSum = 0;
  let valid = 0;
  for (let k = 1; k < half; k++) {
    const m = mag[k]!;
    if (m > 1e-10) {
      logSum += Math.log(m);
      arithSum += m;
      valid++;
    }
  }
  const flatness =
    valid > 0 && arithSum > 0
      ? Math.exp(logSum / valid) / (arithSum / valid)
      : 0;

  // Mel filterbank → log → DCT → MFCC.
  const melEnergies = new Float32Array(NUM_MEL_FILTERS);
  for (let m = 0; m < NUM_MEL_FILTERS; m++) {
    const filter = MEL_FILTERS[m]!;
    let energy = 0;
    for (let k = 0; k < half; k++) {
      energy += mag[k]! * mag[k]! * filter[k]!;
    }
    melEnergies[m] = Math.log(energy + 1e-10);
  }
  const mfcc = dctII(melEnergies, NUM_MFCC_COEFFS);

  // Time-domain features.
  let sumSq = 0;
  let zeroCrossings = 0;
  for (let i = 0; i < N; i++) {
    const s = frame[i]!;
    sumSq += s * s;
    if (i > 0 && (frame[i - 1]! >= 0) !== (s >= 0)) zeroCrossings++;
  }
  const rms = Math.sqrt(sumSq / N);
  const zcr = zeroCrossings / N;

  return { mfcc, centroid, rolloff, flatness, rms, zcr };
}

// ── Whole-track aggregation ────────────────────────────────────────

function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  let sum = 0;
  for (const v of values) sum += v;
  const mean = sum / values.length;
  let sqDiff = 0;
  for (const v of values) sqDiff += (v - mean) ** 2;
  const std = Math.sqrt(sqDiff / values.length);
  return { mean, std };
}

function l2Normalize(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i]! * vec[i]!;
  const norm = Math.sqrt(sumSq);
  if (norm < 1e-10) return vec;
  for (let i = 0; i < vec.length; i++) vec[i] = vec[i]! / norm;
  return vec;
}

/**
 * Compute the full feature vector from a mono PCM signal at SAMPLE_RATE.
 * Returns a length-EMBEDDING_DIM vector, L2-normalized so cosine similarity
 * works directly. Returns null if the signal is shorter than one frame.
 */
export function computeFeatureVector(samples: Float32Array): Float32Array | null {
  if (samples.length < FRAME_SIZE) return null;

  const mfccByCoeff: number[][] = Array.from({ length: NUM_MFCC_COEFFS }, () => []);
  const centroids: number[] = [];
  const rolloffs: number[] = [];
  const flatnesses: number[] = [];
  const rmsValues: number[] = [];
  const zcrs: number[] = [];

  // Pre-allocate the frame buffer once.
  const frame = new Float32Array(FRAME_SIZE);
  for (let start = 0; start + FRAME_SIZE <= samples.length; start += HOP_SIZE) {
    for (let i = 0; i < FRAME_SIZE; i++) frame[i] = samples[start + i]!;
    const f = frameFeatures(frame);
    for (let c = 0; c < NUM_MFCC_COEFFS; c++) mfccByCoeff[c]!.push(f.mfcc[c]!);
    centroids.push(f.centroid);
    rolloffs.push(f.rolloff);
    flatnesses.push(f.flatness);
    rmsValues.push(f.rms);
    zcrs.push(f.zcr);
  }

  if (centroids.length === 0) return null;

  const out = new Float32Array(EMBEDDING_DIM);
  let idx = 0;
  for (let c = 0; c < NUM_MFCC_COEFFS; c++) {
    out[idx++] = meanStd(mfccByCoeff[c]!).mean;
  }
  for (let c = 0; c < NUM_MFCC_COEFFS; c++) {
    out[idx++] = meanStd(mfccByCoeff[c]!).std;
  }
  const cm = meanStd(centroids);
  out[idx++] = cm.mean;
  out[idx++] = cm.std;
  out[idx++] = meanStd(rolloffs).mean;
  out[idx++] = meanStd(flatnesses).mean;
  out[idx++] = meanStd(zcrs).mean;
  out[idx++] = meanStd(rmsValues).mean;

  return l2Normalize(out);
}

// ── Cosine similarity ─────────────────────────────────────────────

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

/** Mean of a set of vectors, then L2-normalized. */
export function meanVector(vectors: ArrayLike<number>[]): Float32Array | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0]!.length;
  const out = new Float32Array(dim);
  for (const v of vectors) {
    if (v.length !== dim) continue;
    for (let i = 0; i < dim; i++) out[i] = out[i]! + v[i]!;
  }
  for (let i = 0; i < dim; i++) out[i] = out[i]! / vectors.length;
  return l2Normalize(out);
}
