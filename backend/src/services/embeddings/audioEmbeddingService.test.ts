import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpDir: string;

vi.mock("../../utils/paths", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../utils/paths")>();
  return {
    ...original,
    get dataRoot() {
      return path.join(tmpDir, "data");
    }
  };
});

vi.mock("../storage/storageService", () => ({
  resolveTrackAbsolutePath: (relativePath: string) => path.join("/abs/music", relativePath)
}));

vi.mock("./embedderClient", () => ({
  requestEmbedding: vi.fn()
}));

vi.mock("./mfccEmbedder", () => ({
  MFCC_EMBEDDING_DIM: 32,
  MFCC_EMBEDDING_VERSION: 2,
  decodeToPcm: vi.fn(),
  computeMfccVector: vi.fn()
}));

vi.mock("../librarySettings/librarySettings", () => ({
  getLibrarySettings: vi.fn()
}));

import { CLAP_EMBEDDING_DIM, CLAP_EMBEDDING_VERSION } from "./audioFeatures";
import { requestEmbedding } from "./embedderClient";
import { computeMfccVector, decodeToPcm, MFCC_EMBEDDING_DIM, MFCC_EMBEDDING_VERSION } from "./mfccEmbedder";
import { getLibrarySettings } from "../librarySettings/librarySettings";

const requestEmbeddingMock = requestEmbedding as ReturnType<typeof vi.fn>;
const decodeToPcmMock = decodeToPcm as ReturnType<typeof vi.fn>;
const computeMfccVectorMock = computeMfccVector as ReturnType<typeof vi.fn>;
const getLibrarySettingsMock = getLibrarySettings as ReturnType<typeof vi.fn>;

function makeVec(seed: number): number[] {
  return Array.from({ length: CLAP_EMBEDDING_DIM }, (_, i) => ((i + seed) % 17) * 0.001);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "embeddings-test-"));
  requestEmbeddingMock.mockReset();
  decodeToPcmMock.mockReset();
  computeMfccVectorMock.mockReset();
  // Default to AI on. MFCC tests override this.
  getLibrarySettingsMock.mockReset();
  getLibrarySettingsMock.mockResolvedValue({ aiRecommendation: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("audioEmbeddingService storage", () => {
  it("round-trips an embedding via save/load", async () => {
    const { saveEmbedding, loadEmbedding } = await import("./audioEmbeddingService");
    const vec = makeVec(0);
    await saveEmbedding({
      trackId: "track-a",
      version: CLAP_EMBEDDING_VERSION,
      computedAt: "2026-05-03T00:00:00Z",
      vec
    });

    const loaded = await loadEmbedding("track-a");
    expect(loaded?.trackId).toBe("track-a");
    expect(loaded?.vec.length).toBe(CLAP_EMBEDDING_DIM);
    expect(loaded?.vec[0]).toBeCloseTo(0, 9);
  });

  it("returns null when no embedding file exists", async () => {
    const { loadEmbedding } = await import("./audioEmbeddingService");
    expect(await loadEmbedding("missing")).toBeNull();
  });

  it("returns null when the persisted version doesn't match", async () => {
    const { saveEmbedding, loadEmbedding } = await import("./audioEmbeddingService");
    await saveEmbedding({
      trackId: "track-old",
      version: CLAP_EMBEDDING_VERSION - 1,
      computedAt: "2026-05-03T00:00:00Z",
      vec: Array(CLAP_EMBEDDING_DIM).fill(0.1)
    });
    expect(await loadEmbedding("track-old")).toBeNull();
  });

  it("returns null when the persisted vector has the wrong dimension", async () => {
    const { saveEmbedding, loadEmbedding } = await import("./audioEmbeddingService");
    await saveEmbedding({
      trackId: "track-bad",
      version: CLAP_EMBEDDING_VERSION,
      computedAt: "2026-05-03T00:00:00Z",
      vec: [0.1, 0.2]
    });
    expect(await loadEmbedding("track-bad")).toBeNull();
  });

  it("hasEmbedding reports true only after a valid save", async () => {
    const { saveEmbedding, hasEmbedding } = await import("./audioEmbeddingService");
    expect(await hasEmbedding("track-c")).toBe(false);

    await saveEmbedding({
      trackId: "track-c",
      version: CLAP_EMBEDDING_VERSION,
      computedAt: "2026-05-03T00:00:00Z",
      vec: Array(CLAP_EMBEDDING_DIM).fill(0.1)
    });
    expect(await hasEmbedding("track-c")).toBe(true);
  });
});

describe("computeAndSaveEmbedding", () => {
  it("calls the sidecar and persists the returned vector", async () => {
    const vec = makeVec(7);
    requestEmbeddingMock.mockResolvedValue({ vec, dim: CLAP_EMBEDDING_DIM, model: "clap" });
    const { computeAndSaveEmbedding, loadEmbedding } = await import("./audioEmbeddingService");

    const result = await computeAndSaveEmbedding("track-x", "artist/album/track.flac");

    expect(result?.trackId).toBe("track-x");
    expect(result?.version).toBe(CLAP_EMBEDDING_VERSION);
    expect(result?.vec.length).toBe(CLAP_EMBEDDING_DIM);

    // Resolved path is passed through to the sidecar client.
    expect(requestEmbeddingMock).toHaveBeenCalledWith("/abs/music/artist/album/track.flac");

    // And it's loadable back from disk.
    const loaded = await loadEmbedding("track-x");
    expect(loaded?.vec[0]).toBeCloseTo(vec[0]!, 9);
  });

  it("returns null without writing anything when the sidecar fails", async () => {
    requestEmbeddingMock.mockResolvedValue(null);
    const { computeAndSaveEmbedding, hasEmbedding } = await import("./audioEmbeddingService");

    const result = await computeAndSaveEmbedding("track-y", "a/b.flac");

    expect(result).toBeNull();
    expect(await hasEmbedding("track-y")).toBe(false);
  });

  it("rejects sidecar responses with the wrong dimension", async () => {
    requestEmbeddingMock.mockResolvedValue({
      vec: [0.1, 0.2, 0.3],
      dim: 3,
      model: "broken"
    });
    const { computeAndSaveEmbedding, hasEmbedding } = await import("./audioEmbeddingService");

    const result = await computeAndSaveEmbedding("track-z", "a/b.flac");

    expect(result).toBeNull();
    expect(await hasEmbedding("track-z")).toBe(false);
  });
});

describe("computeAndSaveEmbedding (AI off — MFCC dispatch)", () => {
  beforeEach(() => {
    getLibrarySettingsMock.mockResolvedValue({ aiRecommendation: false });
  });

  it("decodes via ffmpeg + DSP and persists a v2 sidecar", async () => {
    const fakeSamples = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const fakeVec = new Float32Array(MFCC_EMBEDDING_DIM);
    for (let i = 0; i < MFCC_EMBEDDING_DIM; i++) fakeVec[i] = (i % 7) * 0.01;
    decodeToPcmMock.mockResolvedValue(fakeSamples);
    computeMfccVectorMock.mockReturnValue(fakeVec);
    const { computeAndSaveEmbedding, loadEmbedding } = await import("./audioEmbeddingService");

    const result = await computeAndSaveEmbedding("mfcc-x", "artist/track.flac");

    expect(result?.version).toBe(MFCC_EMBEDDING_VERSION);
    expect(result?.vec.length).toBe(MFCC_EMBEDDING_DIM);
    expect(decodeToPcmMock).toHaveBeenCalledWith("/abs/music/artist/track.flac");
    expect(computeMfccVectorMock).toHaveBeenCalledWith(fakeSamples);

    // Round-trips through loadEmbedding because we're still in MFCC mode.
    const loaded = await loadEmbedding("mfcc-x");
    expect(loaded?.version).toBe(MFCC_EMBEDDING_VERSION);
  });

  it("does NOT call the CLAP sidecar in MFCC mode", async () => {
    decodeToPcmMock.mockResolvedValue(new Float32Array([0.1]));
    computeMfccVectorMock.mockReturnValue(new Float32Array(MFCC_EMBEDDING_DIM));
    const { computeAndSaveEmbedding } = await import("./audioEmbeddingService");

    await computeAndSaveEmbedding("mfcc-y", "a/b.flac");

    expect(requestEmbeddingMock).not.toHaveBeenCalled();
  });

  it("returns null when ffmpeg fails (e.g. binary missing)", async () => {
    decodeToPcmMock.mockRejectedValue(new Error("ffmpeg ENOENT"));
    const { computeAndSaveEmbedding, hasEmbedding } = await import("./audioEmbeddingService");

    const result = await computeAndSaveEmbedding("mfcc-z", "a/b.flac");

    expect(result).toBeNull();
    expect(await hasEmbedding("mfcc-z")).toBe(false);
  });

  it("returns null when the signal is too short for one frame", async () => {
    decodeToPcmMock.mockResolvedValue(new Float32Array([0.1]));
    computeMfccVectorMock.mockReturnValue(null);
    const { computeAndSaveEmbedding, hasEmbedding } = await import("./audioEmbeddingService");

    const result = await computeAndSaveEmbedding("mfcc-short", "a/b.flac");

    expect(result).toBeNull();
    expect(await hasEmbedding("mfcc-short")).toBe(false);
  });
});

describe("getActiveEmbeddingProfile", () => {
  it("returns the CLAP profile when AI recommendation is on", async () => {
    getLibrarySettingsMock.mockResolvedValue({ aiRecommendation: true });
    const { getActiveEmbeddingProfile } = await import("./audioEmbeddingService");

    const profile = await getActiveEmbeddingProfile();

    expect(profile.model).toBe("clap");
    expect(profile.dim).toBe(CLAP_EMBEDDING_DIM);
    expect(profile.version).toBe(CLAP_EMBEDDING_VERSION);
  });

  it("returns the MFCC profile when AI recommendation is off", async () => {
    getLibrarySettingsMock.mockResolvedValue({ aiRecommendation: false });
    const { getActiveEmbeddingProfile } = await import("./audioEmbeddingService");

    const profile = await getActiveEmbeddingProfile();

    expect(profile.model).toBe("mfcc");
    expect(profile.dim).toBe(MFCC_EMBEDDING_DIM);
    expect(profile.version).toBe(MFCC_EMBEDDING_VERSION);
  });

  it("loadEmbedding rejects v3 sidecars when AI is off", async () => {
    const { saveEmbedding, loadEmbedding } = await import("./audioEmbeddingService");
    // Persist a v3 sidecar while AI is on so saveEmbedding doesn't complain.
    await saveEmbedding({
      trackId: "switch-test",
      version: CLAP_EMBEDDING_VERSION,
      computedAt: "2026-05-15T00:00:00Z",
      vec: Array(CLAP_EMBEDDING_DIM).fill(0.01)
    });
    // Flip to MFCC mode → the v3 sidecar must look "missing" now.
    getLibrarySettingsMock.mockResolvedValue({ aiRecommendation: false });
    expect(await loadEmbedding("switch-test")).toBeNull();
  });
});
