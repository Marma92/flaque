import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readJsonFile, updateJsonFile, withFileLock, writeJsonAtomic } from "./fs";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fs-utils-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("withFileLock", () => {
  it("serializes concurrent work on the same path", async () => {
    const filePath = path.join(tmpDir, "counter.txt");
    const order: string[] = [];

    await Promise.all([
      withFileLock(filePath, async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push("a");
      }),
      withFileLock(filePath, async () => {
        order.push("b");
      }),
      withFileLock(filePath, async () => {
        order.push("c");
      })
    ]);

    expect(order).toEqual(["a", "b", "c"]);
  });

  it("does not block work on different paths", async () => {
    const pathA = path.join(tmpDir, "a.json");
    const pathB = path.join(tmpDir, "b.json");
    let bStarted = false;

    const slowA = withFileLock(pathA, async () => {
      await new Promise((r) => setTimeout(r, 30));
      return bStarted;
    });
    const fastB = withFileLock(pathB, async () => {
      bStarted = true;
    });

    await fastB;
    expect(await slowA).toBe(true);
  });

  it("releases the lock even when the callback throws", async () => {
    const filePath = path.join(tmpDir, "err.json");
    await expect(
      withFileLock(filePath, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    const after = await withFileLock(filePath, async () => "ok");
    expect(after).toBe("ok");
  });

  it("resolves paths so equivalent keys share the lock", async () => {
    const filePath = path.join(tmpDir, "same.json");
    const equivalent = path.join(tmpDir, ".", "same.json");
    const order: string[] = [];

    await Promise.all([
      withFileLock(filePath, async () => {
        await new Promise((r) => setTimeout(r, 15));
        order.push("first");
      }),
      withFileLock(equivalent, async () => {
        order.push("second");
      })
    ]);

    expect(order).toEqual(["first", "second"]);
  });
});

describe("updateJsonFile", () => {
  it("reads, mutates and writes atomically", async () => {
    const filePath = path.join(tmpDir, "state.json");
    await writeJsonAtomic(filePath, { count: 1 });

    const result = await updateJsonFile<{ count: number }>(filePath, { count: 0 }, (current) => ({
      count: current.count + 1
    }));

    expect(result).toEqual({ count: 2 });
    expect(await readJsonFile(filePath, null)).toEqual({ count: 2 });
  });

  it("uses the fallback when the file does not exist", async () => {
    const filePath = path.join(tmpDir, "missing.json");
    const result = await updateJsonFile<{ items: string[] }>(
      filePath,
      { items: [] },
      (current) => ({ items: [...current.items, "first"] })
    );
    expect(result).toEqual({ items: ["first"] });
  });

  it("skips the write when the updater returns undefined", async () => {
    const filePath = path.join(tmpDir, "noop.json");
    await writeJsonAtomic(filePath, { v: 1 });
    const statBefore = await fs.stat(filePath);

    await new Promise((r) => setTimeout(r, 5));
    const returned = await updateJsonFile<{ v: number }>(filePath, { v: 0 }, () => undefined);

    const statAfter = await fs.stat(filePath);
    expect(returned).toEqual({ v: 1 });
    expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
  });

  it("serializes concurrent updates so no increment is lost", async () => {
    const filePath = path.join(tmpDir, "counter.json");
    await writeJsonAtomic(filePath, { count: 0 });

    await Promise.all(
      Array.from({ length: 25 }, () =>
        updateJsonFile<{ count: number }>(filePath, { count: 0 }, (current) => ({
          count: current.count + 1
        }))
      )
    );

    expect(await readJsonFile<{ count: number }>(filePath, { count: -1 })).toEqual({ count: 25 });
  });

  it("creates the parent directory when writing into a new subtree", async () => {
    const filePath = path.join(tmpDir, "deep", "nested", "file.json");
    await updateJsonFile<{ hi: boolean }>(filePath, { hi: false }, () => ({ hi: true }));
    expect(await readJsonFile(filePath, null)).toEqual({ hi: true });
  });
});
