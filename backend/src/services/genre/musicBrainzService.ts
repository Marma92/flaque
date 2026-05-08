import fs from "node:fs";
import path from "node:path";

import { createLogger } from "../../utils/logger";
import { cacheRoot } from "../../utils/paths";

const log = createLogger("musicbrainz");

const MB_BASE_URL = "https://musicbrainz.org/ws/2";
const RATE_LIMIT_MS = 1100;
const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_FILE = path.join(cacheRoot, "musicbrainz-genre-cache.json");
const CACHE_FLUSH_DEBOUNCE_MS = 500;
const NEGATIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_SCORE_THRESHOLD = 80;
const RECORDING_SEARCH_LIMIT = 10;

function readVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "../../../package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const USER_AGENT = `flaque/${readVersion()} (https://github.com/Marma92/flaque)`;

type CacheEntry = {
  genres: string[];
  cachedAt: number;
  status: "hit" | "miss";
};

type GenreCache = Record<string, CacheEntry>;
type LegacyGenreCache = Record<string, string[]>;

let cache: GenreCache | null = null;
let cacheDirty = false;
let saveTimer: NodeJS.Timeout | null = null;
let lastRequestTime = 0;
const inflight = new Map<string, Promise<string[]>>();

function cacheKey(artist: string, title: string): string {
  return `${artist.toLowerCase().trim()}|||${title.toLowerCase().trim()}`;
}

function isLegacyEntry(value: unknown): value is string[] {
  return Array.isArray(value);
}

function migrateLegacyEntry(value: string[]): CacheEntry {
  // Old format had no timestamp; treat empty arrays as expired misses so
  // they get re-fetched, and non-empty arrays as forever-valid hits.
  return {
    genres: value,
    cachedAt: value.length > 0 ? Date.now() : 0,
    status: value.length > 0 ? "hit" : "miss"
  };
}

function loadCache(): GenreCache {
  if (cache) return cache;

  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf8");
      const parsed = JSON.parse(raw) as GenreCache | LegacyGenreCache;
      const migrated: GenreCache = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (isLegacyEntry(value)) {
          migrated[key] = migrateLegacyEntry(value);
        } else if (value && typeof value === "object" && Array.isArray((value as CacheEntry).genres)) {
          migrated[key] = value as CacheEntry;
        }
      }
      cache = migrated;
      return cache;
    }
  } catch {
    log.warn("Failed to load MusicBrainz genre cache, starting fresh");
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
    log.warn("Failed to save MusicBrainz genre cache", {
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

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

type MBRecording = {
  id?: string;
  score?: number;
  tags?: Array<{ name?: string; count?: number }>;
  genres?: Array<{ name?: string; count?: number }>;
};

type MBSearchResult = {
  recordings?: MBRecording[];
};

type MBRecordingDetail = {
  genres?: Array<{ name?: string; count?: number }>;
  tags?: Array<{ name?: string; count?: number }>;
};

function extractGenres(recording: MBRecording | MBRecordingDetail): string[] {
  const genres: string[] = [];
  const seen = new Set<string>();

  const sources = [recording.genres ?? [], recording.tags ?? []];
  for (const source of sources) {
    for (const entry of source) {
      if (typeof entry.name !== "string" || !entry.name.trim()) continue;
      const normalized = entry.name.trim().toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      const titleCased = normalized
        .split(/[\s-]+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      genres.push(titleCased);
    }
  }

  return genres;
}

const LUCENE_SPECIAL = /([+\-!(){}\[\]^"~*?:\\/]|&&|\|\|)/g;

function escapeLucene(value: string): string {
  return value.replace(LUCENE_SPECIAL, "\\$1");
}

const PARENS_OR_BRACKETS = /[(\[][^)\]]*[)\]]/g;
const FEAT_SUFFIX = /\s+(feat\.?|featuring|ft\.?)\s+.*$/i;
const TRAILING_DASH_QUALIFIER = /\s+-\s+.*$/;

function simplifyTitle(title: string): string {
  return title
    .replace(PARENS_OR_BRACKETS, " ")
    .replace(FEAT_SUFFIX, "")
    .replace(TRAILING_DASH_QUALIFIER, "")
    .replace(/\s+/g, " ")
    .trim();
}

type SearchOutcome =
  | { kind: "hit"; recording: MBRecording }
  | { kind: "miss" }
  | { kind: "transient" };

async function searchRecording(artist: string, title: string): Promise<SearchOutcome> {
  await waitForRateLimit();

  const escapedTitle = escapeLucene(title);
  const escapedArtist = escapeLucene(artist);
  const query = `recording:"${escapedTitle}" AND artist:"${escapedArtist}"`;
  const searchUrl = `${MB_BASE_URL}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=${RECORDING_SEARCH_LIMIT}`;

  let searchResponse: Response;
  try {
    searchResponse = await fetch(searchUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    log.warn("MusicBrainz lookup failed", {
      artist,
      title,
      error: error instanceof Error ? error.message : String(error)
    });
    return { kind: "transient" };
  }

  if (searchResponse.status >= 500 || searchResponse.status === 429) {
    log.warn(`MusicBrainz search returned ${searchResponse.status}`, { artist, title });
    return { kind: "transient" };
  }

  if (!searchResponse.ok) {
    log.warn(`MusicBrainz search returned ${searchResponse.status}`, { artist, title });
    return { kind: "miss" };
  }

  let searchData: MBSearchResult;
  try {
    searchData = (await searchResponse.json()) as MBSearchResult;
  } catch (error) {
    log.warn("MusicBrainz search returned invalid JSON", {
      artist,
      title,
      error: error instanceof Error ? error.message : String(error)
    });
    return { kind: "transient" };
  }

  const recordings = searchData.recordings ?? [];
  const best = recordings.find((r) => typeof r.score === "number" && r.score >= MIN_SCORE_THRESHOLD);
  if (!best) {
    return { kind: "miss" };
  }

  return { kind: "hit", recording: best };
}

async function fetchRecordingDetail(recordingId: string): Promise<MBRecordingDetail | null> {
  await waitForRateLimit();

  const detailUrl = `${MB_BASE_URL}/recording/${recordingId}?inc=genres+tags&fmt=json`;
  try {
    const detailResponse = await fetch(detailUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!detailResponse.ok) return null;
    return (await detailResponse.json()) as MBRecordingDetail;
  } catch (error) {
    log.warn("MusicBrainz detail fetch failed", {
      recordingId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

type LookupResult =
  | { kind: "resolved"; genres: string[]; status: "hit" | "miss" }
  | { kind: "transient" };

async function lookupGenresUncached(artist: string, title: string): Promise<LookupResult> {
  const passes: string[] = [title];
  const simplified = simplifyTitle(title);
  if (simplified && simplified.toLowerCase() !== title.toLowerCase()) {
    passes.push(simplified);
  }

  for (const candidateTitle of passes) {
    const outcome = await searchRecording(artist, candidateTitle);
    if (outcome.kind === "transient") {
      return { kind: "transient" };
    }
    if (outcome.kind === "miss") {
      continue;
    }

    const fromSearch = extractGenres(outcome.recording);
    if (fromSearch.length > 0) {
      return { kind: "resolved", genres: fromSearch, status: "hit" };
    }

    if (!outcome.recording.id) continue;

    const detail = await fetchRecordingDetail(outcome.recording.id);
    if (!detail) continue;

    const fromDetail = extractGenres(detail);
    if (fromDetail.length > 0) {
      return { kind: "resolved", genres: fromDetail, status: "hit" };
    }
  }

  return { kind: "resolved", genres: [], status: "miss" };
}

export function lookupGenre(artist: string, title: string): Promise<string[]> {
  if (!artist.trim() || !title.trim()) {
    return Promise.resolve([]);
  }

  const c = loadCache();
  const key = cacheKey(artist, title);

  const existing = c[key];
  if (existing && isCacheEntryFresh(existing)) {
    return Promise.resolve(existing.genres);
  }

  const inflightPromise = inflight.get(key);
  if (inflightPromise) {
    return inflightPromise;
  }

  const promise = (async (): Promise<string[]> => {
    try {
      const result = await lookupGenresUncached(artist, title);
      if (result.kind === "transient") {
        return [];
      }
      c[key] = {
        genres: result.genres,
        cachedAt: Date.now(),
        status: result.status
      };
      scheduleCacheSave();
      return result.genres;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

export function getGenreCacheStats(): { entries: number } {
  const c = loadCache();
  return { entries: Object.keys(c).length };
}

export function clearGenreCache(): void {
  cache = {};
  inflight.clear();
  cacheDirty = true;
  flushCacheNow();
}

export function flushGenreCache(): void {
  flushCacheNow();
}
