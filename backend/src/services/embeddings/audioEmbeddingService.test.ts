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

import { EMBEDDING_DIM, EMBEDDING_VERSION } from "./audioFeatures";
import { requestEmbedding } from "./embedderClient";

const requestEmbeddingMock = requestEmbedding as ReturnType<typeof vi.fn>;

function makeVec(seed: number): number[] {
  return Array.from({ length: EMBEDDING_DIM }, (_, i) => ((i + seed) % 17) * 0.001);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "embeddings-test-"));
  requestEmbeddingMock.mockReset();
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
      version: EMBEDDING_VERSION,
      computedAt: "2026-05-03T00:00:00Z",
      vec
    });

    const loaded = await loadEmbedding("track-a");
    expect(loaded?.trackId).toBe("track-a");
    expect(loaded?.vec.length).toBe(EMBEDDING_DIM);
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
      version: EMBEDDING_VERSION - 1,
      computedAt: "2026-05-03T00:00:00Z",
      vec: Array(EMBEDDING_DIM).fill(0.1)
    });
    expect(await loadEmbedding("track-old")).toBeNull();
  });

  it("returns null when the persisted vector has the wrong dimension", async () => {
    const { saveEmbedding, loadEmbedding } = await import("./audioEmbeddingService");
    await saveEmbedding({
      trackId: "track-bad",
      version: EMBEDDING_VERSION,
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
      version: EMBEDDING_VERSION,
      computedAt: "2026-05-03T00:00:00Z",
      vec: Array(EMBEDDING_DIM).fill(0.1)
    });
    expect(await hasEmbedding("track-c")).toBe(true);
  });
});

describe("computeAndSaveEmbedding", () => {
  it("calls the sidecar and persists the returned vector", async () => {
    const vec = makeVec(7);
    requestEmbeddingMock.mockResolvedValue({ vec, dim: EMBEDDING_DIM, model: "clap" });
    const { computeAndSaveEmbedding, loadEmbedding } = await import("./audioEmbeddingService");

    const result = await computeAndSaveEmbedding("track-x", "artist/album/track.flac");

    expect(result?.trackId).toBe("track-x");
    expect(result?.version).toBe(EMBEDDING_VERSION);
    expect(result?.vec.length).toBe(EMBEDDING_DIM);

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
