import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { tmpDir } = vi.hoisted(() => {
  const fsS = require("node:fs") as typeof import("node:fs");
  const osM = require("node:os") as typeof import("node:os");
  const pathM = require("node:path") as typeof import("node:path");
  return {
    tmpDir: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "ownership-test-"))
  };
});

vi.mock("../../utils/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths")>()),
  indexRoot: tmpDir
}));

import {
  pruneTrackOwnership,
  readTrackOwnership,
  registerTrackOwner,
  writeTrackOwnership
} from "./ownershipStore";

beforeEach(async () => {
  for (const entry of await fs.readdir(tmpDir)) {
    await fs.rm(path.join(tmpDir, entry), { recursive: true, force: true });
  }
});

afterAll(() => {
  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ownershipStore", () => {
  it("returns an empty map when no ownership file exists", async () => {
    expect(await readTrackOwnership()).toEqual({});
  });

  it("registers a new owner and persists it", async () => {
    await registerTrackOwner("a/b.mp3", "user-1");
    expect(await readTrackOwnership()).toEqual({ "a/b.mp3": "user-1" });
  });

  it("does not overwrite an existing owner", async () => {
    await registerTrackOwner("a/b.mp3", "user-1");
    await registerTrackOwner("a/b.mp3", "user-2");
    expect((await readTrackOwnership())["a/b.mp3"]).toBe("user-1");
  });

  it("preserves every registration under concurrent writes", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        registerTrackOwner(`track-${i}.mp3`, `user-${i % 3}`)
      )
    );
    const ownership = await readTrackOwnership();
    expect(Object.keys(ownership)).toHaveLength(20);
    for (let i = 0; i < 20; i++) {
      expect(ownership[`track-${i}.mp3`]).toBe(`user-${i % 3}`);
    }
  });

  it("prunes entries whose paths are not in the valid set", async () => {
    await writeTrackOwnership({
      "keep.mp3": "user-1",
      "drop.mp3": "user-2"
    });
    await pruneTrackOwnership(["keep.mp3"]);
    expect(await readTrackOwnership()).toEqual({ "keep.mp3": "user-1" });
  });

  it("leaves the file untouched when prune has nothing to remove", async () => {
    await writeTrackOwnership({ "keep.mp3": "user-1" });
    const ownershipPath = path.join(tmpDir, "track-ownership.json");
    const mtimeBefore = (await fs.stat(ownershipPath)).mtimeMs;
    await new Promise((r) => setTimeout(r, 5));
    await pruneTrackOwnership(["keep.mp3"]);
    const mtimeAfter = (await fs.stat(ownershipPath)).mtimeMs;
    expect(mtimeAfter).toBe(mtimeBefore);
  });
});
