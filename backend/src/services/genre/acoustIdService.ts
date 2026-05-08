import fs from "node:fs";
import path from "node:path";

import { createLogger } from "../../utils/logger";
import { cacheRoot } from "../../utils/paths";

const log = createLogger("acoustid");

const CACHE_FILE = path.join(cacheRoot, "acoustid-cache.json");
const CACHE_FLUSH_DEBOUNCE_MS = 500;
const NEGATIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const REQUEST_TIMEOUT_MS = 15_000;
const MIN_SCORE_THRESHOLD = 0.85;

const ACOUSTID_BASE_URL = "https://api.acoustid.org/v2";

function getApiKey(): string | null {
  const key = (process.env.ACOUSTID_API_KEY ?? "").trim();
  return key.length > 0 ? key : null;
}

export function isAcoustIdConfigured(): boolean {
  return getApiKey() !== null;
}

type CacheEntry = {
  cachedAt: number;
  status: "hit" | "miss";
  recordingMbid?: string;
  score?: number;
};

type AcoustIdCache = Record<string, CacheEntry>;

let cache: AcoustIdCache | null = null;
let cacheDirty = false;
let saveTimer: NodeJS.Timeout | null = null;
const inflight = new Map<string, Promise<AcoustIdLookupResult | null>>();

function cacheKeyForFingerprint(fingerprint: string, duration: number): string {
  return `${Math.round(duration)}|${fingerprint}`;
}

function loadCache(): AcoustIdCache {
  if (cache) return cache;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const cleaned: AcoustIdCache = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (
          value &&
          typeof value === "object" &&
          typeof (value as CacheEntry).cachedAt === "number" &&
          ((value as CacheEntry).status === "hit" || (value as CacheEntry).status === "miss")
        ) {
          cleaned[key] = value as CacheEntry;
        }
      }
      cache = cleaned;
      return cache;
    }
  } catch {
    log.warn("Failed to load AcoustID cache, starting fresh");
  }
  cache = {};
  return cache;
}

function flushCacheNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!cache || !cacheDirty) return;
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const tmpPath = `${CACHE_FILE}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(cache, null, 2), "utf8");
    fs.renameSync(tmpPath, CACHE_FILE);
    cacheDirty = false;
  } catch (error) {
    log.warn("Failed to save AcoustID cache", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function scheduleCacheSave(): void {
  cacheDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushCacheNow();
  }, CACHE_FLUSH_DEBOUNCE_MS);
  saveTimer.unref?.();
}

function isCacheEntryFresh(entry: CacheEntry): boolean {
  if (entry.status === "hit") return true;
  return Date.now() - entry.cachedAt < NEGATIVE_CACHE_TTL_MS;
}

type AcoustIdRecordingHit = { id?: string };
type AcoustIdResult = {
  id?: string;
  score?: number;
  recordings?: AcoustIdRecordingHit[];
};
type AcoustIdResponse = {
  status?: string;
  results?: AcoustIdResult[];
  error?: { message?: string };
};

export type AcoustIdLookupResult = {
  recordingMbid: string;
  score: number;
};

function pickBestHit(results: AcoustIdResult[]): AcoustIdLookupResult | null {
  let best: AcoustIdLookupResult | null = null;
  for (const result of results) {
    const score = typeof result.score === "number" ? result.score : 0;
    if (score < MIN_SCORE_THRESHOLD) continue;
    const recordings = result.recordings ?? [];
    for (const rec of recordings) {
      if (typeof rec.id !== "string" || rec.id.length === 0) continue;
      if (!best || score > best.score) {
        best = { recordingMbid: rec.id, score };
      }
    }
  }
  return best;
}

type LookupOutcome =
  | { kind: "resolved"; hit: AcoustIdLookupResult | null }
  | { kind: "transient" };

async function performLookup(fingerprint: string, duration: number, apiKey: string): Promise<LookupOutcome> {
  const body = new URLSearchParams({
    client: apiKey,
    duration: String(Math.round(duration)),
    fingerprint,
    meta: "recordings"
  });

  let response: Response;
  try {
    response = await fetch(`${ACOUSTID_BASE_URL}/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    log.warn("AcoustID lookup failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return { kind: "transient" };
  }

  if (response.status >= 500 || response.status === 429) {
    log.warn(`AcoustID returned ${response.status}`);
    return { kind: "transient" };
  }
  if (!response.ok) {
    log.warn(`AcoustID returned ${response.status}`);
    return { kind: "resolved", hit: null };
  }

  let payload: AcoustIdResponse;
  try {
    payload = (await response.json()) as AcoustIdResponse;
  } catch (error) {
    log.warn("AcoustID returned invalid JSON", {
      error: error instanceof Error ? error.message : String(error)
    });
    return { kind: "transient" };
  }

  if (payload.status !== "ok") {
    log.warn(`AcoustID error: ${payload.error?.message ?? "unknown"}`);
    return { kind: "resolved", hit: null };
  }

  const hit = pickBestHit(payload.results ?? []);
  return { kind: "resolved", hit };
}

/**
 * Look up a Chromaprint fingerprint via AcoustID and return the best
 * matching recording MBID, or null on miss/transient/unconfigured. Results
 * are cached locally with the same TTL semantics as the MB cache: hits
 * are forever, misses last 7 days, transient errors are not cached.
 */
export async function lookupRecordingByFingerprint(
  fingerprint: string,
  duration: number
): Promise<AcoustIdLookupResult | null> {
  if (!fingerprint.trim() || !Number.isFinite(duration) || duration <= 0) return null;
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const c = loadCache();
  const key = cacheKeyForFingerprint(fingerprint, duration);
  const existing = c[key];
  if (existing && isCacheEntryFresh(existing)) {
    if (existing.status === "miss") return null;
    if (existing.recordingMbid) {
      return { recordingMbid: existing.recordingMbid, score: existing.score ?? 1 };
    }
  }

  const inflightPromise = inflight.get(key);
  if (inflightPromise) return inflightPromise;

  const promise = (async (): Promise<AcoustIdLookupResult | null> => {
    try {
      const outcome = await performLookup(fingerprint, duration, apiKey);
      if (outcome.kind === "transient") return null;
      c[key] = outcome.hit
        ? {
            cachedAt: Date.now(),
            status: "hit",
            recordingMbid: outcome.hit.recordingMbid,
            score: outcome.hit.score
          }
        : { cachedAt: Date.now(), status: "miss" };
      scheduleCacheSave();
      return outcome.hit;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

export function flushAcoustIdCache(): void {
  flushCacheNow();
}

export function clearAcoustIdCache(): void {
  cache = {};
  inflight.clear();
  cacheDirty = true;
  flushCacheNow();
}

export function getAcoustIdCacheStats(): { entries: number } {
  return { entries: Object.keys(loadCache()).length };
}
