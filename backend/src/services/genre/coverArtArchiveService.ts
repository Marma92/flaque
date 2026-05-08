import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { cacheRoot, coversRoot } from "../../utils/paths";
import { createLogger } from "../../utils/logger";

const log = createLogger("cover-art-archive");

const CAA_BASE_URL = "https://coverartarchive.org";
const REQUEST_TIMEOUT_MS = 15_000;
const NEGATIVE_CACHE_FILE = path.join(cacheRoot, "cover-art-archive-misses.json");
const NEGATIVE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const NEGATIVE_CACHE_FLUSH_DEBOUNCE_MS = 500;
const COVER_FILE_EXTENSION = ".jpg";

type NegativeCache = Record<string, number>;

let negativeCache: NegativeCache | null = null;
let negativeDirty = false;
let negativeSaveTimer: NodeJS.Timeout | null = null;

function loadNegativeCache(): NegativeCache {
  if (negativeCache) return negativeCache;
  try {
    if (fs.existsSync(NEGATIVE_CACHE_FILE)) {
      const raw = fs.readFileSync(NEGATIVE_CACHE_FILE, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const cleaned: NegativeCache = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "number" && Number.isFinite(value)) {
          cleaned[key] = value;
        }
      }
      negativeCache = cleaned;
      return cleaned;
    }
  } catch {
    log.warn("Failed to load Cover Art Archive negative cache, starting fresh");
  }
  negativeCache = {};
  return negativeCache;
}

function flushNegativeCacheNow(): void {
  if (negativeSaveTimer) {
    clearTimeout(negativeSaveTimer);
    negativeSaveTimer = null;
  }
  if (!negativeCache || !negativeDirty) return;

  try {
    fs.mkdirSync(path.dirname(NEGATIVE_CACHE_FILE), { recursive: true });
    const tmpPath = `${NEGATIVE_CACHE_FILE}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(negativeCache, null, 2), "utf8");
    fs.renameSync(tmpPath, NEGATIVE_CACHE_FILE);
    negativeDirty = false;
  } catch (error) {
    log.warn("Failed to save Cover Art Archive negative cache", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function scheduleNegativeCacheSave(): void {
  negativeDirty = true;
  if (negativeSaveTimer) return;
  negativeSaveTimer = setTimeout(() => {
    negativeSaveTimer = null;
    flushNegativeCacheNow();
  }, NEGATIVE_CACHE_FLUSH_DEBOUNCE_MS);
  negativeSaveTimer.unref?.();
}

function isNegativeFresh(cachedAt: number): boolean {
  return Date.now() - cachedAt < NEGATIVE_CACHE_TTL_MS;
}

export type CoverArtFetchResult =
  | { kind: "saved"; bytes: number }
  | { kind: "skipped-cached-miss" }
  | { kind: "no-art" }
  | { kind: "transient" };

/**
 * Download the front cover for a release-group from the Cover Art Archive
 * and save it to coversRoot/<trackId>.jpg. Returns "no-art" for a confirmed
 * 404 (and remembers it for 30 days to avoid re-hitting CAA on every
 * enrichment pass). Returns "transient" for network errors / 5xx so the
 * caller can retry on the next run.
 */
export async function fetchAndSaveCoverArt(
  trackId: string,
  releaseGroupMbid: string
): Promise<CoverArtFetchResult> {
  const negCache = loadNegativeCache();
  const cachedMissAt = negCache[releaseGroupMbid];
  if (typeof cachedMissAt === "number" && isNegativeFresh(cachedMissAt)) {
    return { kind: "skipped-cached-miss" };
  }

  const url = `${CAA_BASE_URL}/release-group/${releaseGroupMbid}/front-500`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "flaque (https://github.com/Marma92/flaque)" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "follow"
    });
  } catch (error) {
    log.warn("Cover Art Archive fetch failed", {
      releaseGroupMbid,
      error: error instanceof Error ? error.message : String(error)
    });
    return { kind: "transient" };
  }

  if (response.status === 404) {
    negCache[releaseGroupMbid] = Date.now();
    scheduleNegativeCacheSave();
    return { kind: "no-art" };
  }

  if (response.status >= 500 || response.status === 429) {
    log.warn(`Cover Art Archive returned ${response.status}`, { releaseGroupMbid });
    return { kind: "transient" };
  }

  if (!response.ok) {
    log.warn(`Cover Art Archive returned ${response.status}`, { releaseGroupMbid });
    return { kind: "transient" };
  }

  let buffer: Buffer;
  try {
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch (error) {
    log.warn("Cover Art Archive: failed to read body", {
      releaseGroupMbid,
      error: error instanceof Error ? error.message : String(error)
    });
    return { kind: "transient" };
  }

  if (buffer.length === 0) {
    return { kind: "transient" };
  }

  try {
    await fsp.mkdir(coversRoot, { recursive: true });
    const targetPath = path.join(coversRoot, `${trackId}${COVER_FILE_EXTENSION}`);
    const tmpPath = `${targetPath}.tmp`;
    await fsp.writeFile(tmpPath, buffer);
    await fsp.rename(tmpPath, targetPath);
    return { kind: "saved", bytes: buffer.length };
  } catch (error) {
    log.warn("Failed to write cover art file", {
      trackId,
      releaseGroupMbid,
      error: error instanceof Error ? error.message : String(error)
    });
    return { kind: "transient" };
  }
}

export function flushCoverArtNegativeCache(): void {
  flushNegativeCacheNow();
}

export function clearCoverArtNegativeCache(): void {
  negativeCache = {};
  negativeDirty = true;
  flushNegativeCacheNow();
}
