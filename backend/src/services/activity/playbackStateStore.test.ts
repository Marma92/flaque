import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpDir: string;

vi.mock("../../utils/paths", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../utils/paths")>();
  return {
    ...original,
    get usersStorageRoot() {
      return tmpDir;
    }
  };
});

import {
  clearPlaybackState,
  getPlaybackState,
  setPlaybackState
} from "./playbackStateStore";

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "playback-state-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("playbackStateStore", () => {
  it("returns null when nothing has been stored", async () => {
    expect(await getPlaybackState("user-1")).toBeNull();
  });

  it("stores and retrieves a playback state with an updatedAt timestamp", async () => {
    const result = await setPlaybackState("user-1", { trackId: "track-a", positionSec: 12.5 });

    expect(result.trackId).toBe("track-a");
    expect(result.positionSec).toBe(12.5);
    expect(result.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const fetched = await getPlaybackState("user-1");
    expect(fetched).toEqual(result);
  });

  it("clamps negative positions to zero", async () => {
    const result = await setPlaybackState("user-1", { trackId: "track-a", positionSec: -7 });
    expect(result.positionSec).toBe(0);
  });

  it("falls back to zero when given a non-finite position", async () => {
    const result = await setPlaybackState("user-1", {
      trackId: "track-a",
      positionSec: Number.NaN
    });
    expect(result.positionSec).toBe(0);
  });

  it("overwrites previous state with the latest write", async () => {
    await setPlaybackState("user-1", { trackId: "track-a", positionSec: 10 });
    await setPlaybackState("user-1", { trackId: "track-b", positionSec: 30 });

    const fetched = await getPlaybackState("user-1");
    expect(fetched?.trackId).toBe("track-b");
    expect(fetched?.positionSec).toBe(30);
  });

  it("isolates state per user", async () => {
    await setPlaybackState("user-1", { trackId: "track-a", positionSec: 10 });
    await setPlaybackState("user-2", { trackId: "track-b", positionSec: 20 });

    expect((await getPlaybackState("user-1"))?.trackId).toBe("track-a");
    expect((await getPlaybackState("user-2"))?.trackId).toBe("track-b");
  });

  it("stores and retrieves the playback queue", async () => {
    const result = await setPlaybackState("user-1", {
      trackId: "track-a",
      positionSec: 5,
      queue: ["track-a", "track-b", "track-c"]
    });

    expect(result.queue).toEqual(["track-a", "track-b", "track-c"]);
    expect((await getPlaybackState("user-1"))?.queue).toEqual([
      "track-a",
      "track-b",
      "track-c"
    ]);
  });

  it("preserves the existing queue when a position-only update omits it", async () => {
    await setPlaybackState("user-1", {
      trackId: "track-a",
      positionSec: 5,
      queue: ["track-a", "track-b", "track-c"]
    });

    const updated = await setPlaybackState("user-1", { trackId: "track-b", positionSec: 42 });

    expect(updated.trackId).toBe("track-b");
    expect(updated.positionSec).toBe(42);
    expect(updated.queue).toEqual(["track-a", "track-b", "track-c"]);
  });

  it("replaces the queue when a new one is provided", async () => {
    await setPlaybackState("user-1", {
      trackId: "track-a",
      positionSec: 5,
      queue: ["track-a", "track-b"]
    });

    const updated = await setPlaybackState("user-1", {
      trackId: "track-x",
      positionSec: 0,
      queue: ["track-x", "track-y"]
    });

    expect(updated.queue).toEqual(["track-x", "track-y"]);
  });

  it("drops an empty queue rather than storing it", async () => {
    const result = await setPlaybackState("user-1", {
      trackId: "track-a",
      positionSec: 5,
      queue: []
    });

    expect(result.queue).toBeUndefined();
  });

  it("clearPlaybackState removes the stored state", async () => {
    await setPlaybackState("user-1", { trackId: "track-a", positionSec: 10 });
    await clearPlaybackState("user-1");

    expect(await getPlaybackState("user-1")).toBeNull();
  });
});
