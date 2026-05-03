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

import { getRecentSkipCounts, getUserSkipCounts, recordSkip } from "./skipStore";

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skips-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("skipStore", () => {
  it("records the first skip with count=1 and a timestamp", async () => {
    await recordSkip("user-1", "track-a");
    const skips = await getUserSkipCounts("user-1");
    expect(skips["track-a"]?.count).toBe(1);
    expect(skips["track-a"]?.lastSkippedAt ?? "").toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("accumulates concurrent skips without losing any", async () => {
    await Promise.all(Array.from({ length: 30 }, () => recordSkip("user-1", "track-a")));
    const skips = await getUserSkipCounts("user-1");
    expect(skips["track-a"]?.count).toBe(30);
  });

  it("isolates skips between users", async () => {
    await recordSkip("user-1", "track-a");
    await recordSkip("user-2", "track-a");
    await recordSkip("user-2", "track-a");

    expect((await getUserSkipCounts("user-1"))["track-a"]?.count).toBe(1);
    expect((await getUserSkipCounts("user-2"))["track-a"]?.count).toBe(2);
  });

  it("filters out entries older than the recent window", async () => {
    const userPath = path.join(tmpDir, "user-1");
    await fs.mkdir(userPath, { recursive: true });
    const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    await fs.writeFile(
      path.join(userPath, "skips.json"),
      JSON.stringify({
        tracks: {
          "track-old": { count: 5, lastSkippedAt: old },
          "track-recent": { count: 2, lastSkippedAt: recent }
        }
      })
    );

    const recentOnly = await getRecentSkipCounts("user-1", 60);
    expect(recentOnly["track-recent"]?.count).toBe(2);
    expect(recentOnly["track-old"]).toBeUndefined();
  });
});
