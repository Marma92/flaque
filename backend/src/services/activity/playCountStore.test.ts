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

import { getUserPlayCounts, incrementPlayCount } from "./playCountStore";

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "play-counts-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("playCountStore", () => {
  it("records the first play with count=1 and a timestamp", async () => {
    await incrementPlayCount("user-1", "track-a");
    const counts = await getUserPlayCounts("user-1");
    expect(counts["track-a"].count).toBe(1);
    expect(counts["track-a"].lastPlayedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("accumulates concurrent increments without losing any", async () => {
    await Promise.all(
      Array.from({ length: 50 }, () => incrementPlayCount("user-1", "track-a"))
    );
    const counts = await getUserPlayCounts("user-1");
    expect(counts["track-a"].count).toBe(50);
  });

  it("tracks distinct tracks independently", async () => {
    await Promise.all([
      incrementPlayCount("user-1", "track-a"),
      incrementPlayCount("user-1", "track-b"),
      incrementPlayCount("user-1", "track-a")
    ]);
    const counts = await getUserPlayCounts("user-1");
    expect(counts["track-a"].count).toBe(2);
    expect(counts["track-b"].count).toBe(1);
  });

  it("isolates counts between users", async () => {
    await incrementPlayCount("user-1", "track-a");
    await incrementPlayCount("user-2", "track-a");
    await incrementPlayCount("user-2", "track-a");

    expect((await getUserPlayCounts("user-1"))["track-a"].count).toBe(1);
    expect((await getUserPlayCounts("user-2"))["track-a"].count).toBe(2);
  });
});
