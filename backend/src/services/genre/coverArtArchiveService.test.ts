import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { tmpRoot } = vi.hoisted(() => {
  const fsS = require("node:fs") as typeof import("node:fs");
  const osM = require("node:os") as typeof import("node:os");
  const pathM = require("node:path") as typeof import("node:path");
  return {
    tmpRoot: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "caa-test-"))
  };
});

const cacheRootDir = path.join(tmpRoot, "cache");
const coversRootDir = path.join(tmpRoot, "covers");

vi.mock("../../utils/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths")>()),
  cacheRoot: cacheRootDir,
  coversRoot: coversRootDir
}));

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

const NEGATIVE_CACHE_FILE = path.join(cacheRootDir, "cover-art-archive-misses.json");
const RG_MBID = "11111111-1111-4111-8111-111111111111";
const RG_MBID_2 = "22222222-2222-4222-8222-222222222222";

type FetchHandler = (url: string) => { status?: number; body?: Buffer; throw?: Error };

let fetchHandler: FetchHandler = () => ({ status: 404 });
let fetchCalls: string[] = [];

beforeEach(async () => {
  vi.resetModules();
  for (const dir of [cacheRootDir, coversRootDir]) {
    if (fsSync.existsSync(dir)) {
      for (const entry of await fs.readdir(dir).catch(() => [])) {
        await fs.rm(path.join(dir, entry), { recursive: true, force: true });
      }
    }
  }
  fetchHandler = () => ({ status: 404 });
  fetchCalls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    fetchCalls.push(url);
    const result = fetchHandler(url);
    if (result.throw) throw result.throw;
    const body = result.body ?? Buffer.alloc(0);
    return new Response(body, {
      status: result.status ?? 200
    });
  }));
});

afterAll(() => {
  vi.unstubAllGlobals();
  fsSync.rmSync(tmpRoot, { recursive: true, force: true });
});

async function loadModule(): Promise<typeof import("./coverArtArchiveService")> {
  return await import("./coverArtArchiveService");
}

describe("coverArtArchiveService", () => {
  it("downloads and saves cover art to coversRoot/<trackId>.jpg", async () => {
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    fetchHandler = () => ({ status: 200, body: fakeJpeg });
    const { fetchAndSaveCoverArt } = await loadModule();

    const result = await fetchAndSaveCoverArt("track-1", RG_MBID);
    expect(result.kind).toBe("saved");
    if (result.kind === "saved") expect(result.bytes).toBe(fakeJpeg.length);

    const target = path.join(coversRootDir, "track-1.jpg");
    expect(fsSync.existsSync(target)).toBe(true);
    expect(fsSync.readFileSync(target).equals(fakeJpeg)).toBe(true);
    expect(fsSync.existsSync(`${target}.tmp`)).toBe(false);
  });

  it("hits the release-group/{mbid}/front-500 endpoint", async () => {
    fetchHandler = () => ({ status: 200, body: Buffer.from([0xff, 0xd8]) });
    const { fetchAndSaveCoverArt } = await loadModule();
    await fetchAndSaveCoverArt("track-1", RG_MBID);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toBe(`https://coverartarchive.org/release-group/${RG_MBID}/front-500`);
  });

  it("caches 404s and skips re-fetching for 30 days", async () => {
    fetchHandler = () => ({ status: 404 });
    const { fetchAndSaveCoverArt, flushCoverArtNegativeCache } = await loadModule();

    expect((await fetchAndSaveCoverArt("track-1", RG_MBID)).kind).toBe("no-art");
    flushCoverArtNegativeCache();

    fetchCalls = [];
    const second = await fetchAndSaveCoverArt("track-2", RG_MBID);
    expect(second.kind).toBe("skipped-cached-miss");
    expect(fetchCalls).toEqual([]);
  });

  it("does NOT cache 5xx as a miss (transient retry)", async () => {
    fetchHandler = () => ({ status: 503 });
    const { fetchAndSaveCoverArt, flushCoverArtNegativeCache } = await loadModule();
    expect((await fetchAndSaveCoverArt("track-1", RG_MBID)).kind).toBe("transient");
    flushCoverArtNegativeCache();

    expect(fsSync.existsSync(NEGATIVE_CACHE_FILE)).toBe(false);
  });

  it("does NOT cache network errors as a miss (transient retry)", async () => {
    fetchHandler = () => ({ throw: new Error("ECONNRESET") });
    const { fetchAndSaveCoverArt } = await loadModule();
    expect((await fetchAndSaveCoverArt("track-1", RG_MBID)).kind).toBe("transient");
  });

  it("expires the negative cache after 30 days", async () => {
    fetchHandler = () => ({ status: 404 });
    const { fetchAndSaveCoverArt, flushCoverArtNegativeCache } = await loadModule();
    expect((await fetchAndSaveCoverArt("track-1", RG_MBID)).kind).toBe("no-art");
    flushCoverArtNegativeCache();

    // Manually rewrite the file with an ancient cachedAt
    const raw = JSON.parse(fsSync.readFileSync(NEGATIVE_CACHE_FILE, "utf8")) as Record<string, number>;
    for (const key of Object.keys(raw)) raw[key] = 0;
    fsSync.writeFileSync(NEGATIVE_CACHE_FILE, JSON.stringify(raw), "utf8");

    vi.resetModules();
    const reloaded = await loadModule();
    fetchHandler = () => ({ status: 200, body: Buffer.from([0xff, 0xd8]) });
    const result = await reloaded.fetchAndSaveCoverArt("track-1", RG_MBID);
    expect(result.kind).toBe("saved");
  });

  it("treats a different release-group as a separate negative cache key", async () => {
    fetchHandler = () => ({ status: 404 });
    const { fetchAndSaveCoverArt } = await loadModule();
    await fetchAndSaveCoverArt("track-1", RG_MBID);

    fetchCalls = [];
    fetchHandler = () => ({ status: 200, body: Buffer.from([0xff]) });
    const second = await fetchAndSaveCoverArt("track-2", RG_MBID_2);
    expect(second.kind).toBe("saved");
    expect(fetchCalls).toHaveLength(1);
  });
});
