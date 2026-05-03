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

import { EMBEDDING_VERSION } from "./audioFeatures";

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "embeddings-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("audioEmbeddingService storage", () => {
  it("round-trips an embedding via save/load", async () => {
    const { saveEmbedding, loadEmbedding } = await import("./audioEmbeddingService");
    const vec = Array.from({ length: 32 }, (_, i) => i / 32);
    await saveEmbedding({
      trackId: "track-a",
      version: EMBEDDING_VERSION,
      computedAt: "2026-05-03T00:00:00Z",
      vec
    });

    const loaded = await loadEmbedding("track-a");
    expect(loaded?.trackId).toBe("track-a");
    expect(loaded?.vec.length).toBe(32);
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
      version: EMBEDDING_VERSION + 99,
      computedAt: "2026-05-03T00:00:00Z",
      vec: Array(32).fill(0.1)
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
      vec: Array(32).fill(0.1)
    });
    expect(await hasEmbedding("track-c")).toBe(true);
  });
});
