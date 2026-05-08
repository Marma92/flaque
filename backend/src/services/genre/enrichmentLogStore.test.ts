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
    tmpDir: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "enrichment-log-test-"))
  };
});

vi.mock("../../utils/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths")>()),
  cacheRoot: tmpDir
}));

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

const LOG_FILE = path.join(tmpDir, "musicbrainz-enrichment-log.jsonl");

beforeEach(async () => {
  vi.resetModules();
  for (const entry of await fs.readdir(tmpDir).catch(() => [])) {
    await fs.rm(path.join(tmpDir, entry), { recursive: true, force: true });
  }
});

afterAll(() => {
  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

async function loadModule(): Promise<typeof import("./enrichmentLogStore")> {
  return await import("./enrichmentLogStore");
}

describe("enrichmentLogStore", () => {
  it("appends an entry and reads it back", async () => {
    const { appendEnrichmentLog, readEnrichmentLog } = await loadModule();
    appendEnrichmentLog({
      timestamp: "2026-05-08T12:00:00Z",
      trackId: "t-1",
      artist: "Artist",
      title: "Title",
      source: "bulk",
      status: "hit",
      filledGenre: ["Rock"],
      filledYear: 1979
    });

    const entries = await readEnrichmentLog(10);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.trackId).toBe("t-1");
    expect(entries[0]?.filledGenre).toEqual(["Rock"]);
    expect(entries[0]?.filledYear).toBe(1979);
  });

  it("returns most recent first and respects the limit", async () => {
    const { appendEnrichmentLog, readEnrichmentLog } = await loadModule();
    for (let i = 0; i < 5; i++) {
      appendEnrichmentLog({
        timestamp: `2026-05-08T12:00:0${i}Z`,
        trackId: `t-${i}`,
        artist: "A",
        title: `Title ${i}`,
        source: "bulk",
        status: "hit"
      });
    }
    const entries = await readEnrichmentLog(3);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.trackId)).toEqual(["t-4", "t-3", "t-2"]);
  });

  it("returns empty array when no log file exists", async () => {
    const { readEnrichmentLog } = await loadModule();
    const entries = await readEnrichmentLog(10);
    expect(entries).toEqual([]);
  });

  it("clears the log file", async () => {
    const { appendEnrichmentLog, clearEnrichmentLog, readEnrichmentLog } = await loadModule();
    appendEnrichmentLog({
      timestamp: "2026-05-08T12:00:00Z",
      trackId: "t-1",
      artist: "A",
      title: "T",
      source: "bulk",
      status: "hit"
    });
    expect(fsSync.existsSync(LOG_FILE)).toBe(true);
    await clearEnrichmentLog();
    expect(fsSync.existsSync(LOG_FILE)).toBe(false);
    expect(await readEnrichmentLog(10)).toEqual([]);
  });

  it("skips malformed lines without throwing", async () => {
    fsSync.mkdirSync(tmpDir, { recursive: true });
    fsSync.writeFileSync(
      LOG_FILE,
      `{"trackId":"good","timestamp":"2026-05-08T12:00:00Z","artist":"A","title":"T","source":"bulk","status":"hit"}\nnot-json\n{"missing-track-id":true}\n`,
      "utf8"
    );
    const { readEnrichmentLog } = await loadModule();
    const entries = await readEnrichmentLog(10);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.trackId).toBe("good");
  });

  it("trims the log when it grows beyond the threshold", async () => {
    const { appendEnrichmentLog, readEnrichmentLog } = await loadModule();
    // Append 1300 entries; module trims back to 1000 once it crosses 1200.
    for (let i = 0; i < 1300; i++) {
      appendEnrichmentLog({
        timestamp: `2026-05-08T12:00:00.${String(i).padStart(4, "0")}Z`,
        trackId: `t-${i}`,
        artist: "A",
        title: `T${i}`,
        source: "bulk",
        status: "hit"
      });
    }
    const all = await readEnrichmentLog(2000);
    expect(all.length).toBeLessThanOrEqual(1000);
    // The most recent entry should still be present and at the front
    expect(all[0]?.trackId).toBe("t-1299");
  });
});
