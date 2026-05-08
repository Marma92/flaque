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
const RICH_SCHEMA_VERSION = 1;

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

export type RecordingMetadata = {
  genres: string[];
  recordingMbid?: string;
  releaseGroupMbid?: string;
  artistMbid?: string;
  year?: number;
};

type CacheEntry = {
  cachedAt: number;
  status: "hit" | "miss";
  // Set to RICH_SCHEMA_VERSION once we've populated MBIDs and year. Absent
  // for Phase 1 entries (genres-only), which trigger a refetch when a
  // caller asks for richer metadata.
  richVersion?: number;
  genres: string[];
  recordingMbid?: string;
  releaseGroupMbid?: string;
  artistMbid?: string;
  year?: number;
};

type GenreCache = Record<string, CacheEntry>;
type LegacyGenreCache = Record<string, string[]>;

let cache: GenreCache | null = null;
let cacheDirty = false;
let saveTimer: NodeJS.Timeout | null = null;
let lastRequestTime = 0;
const inflightGenre = new Map<string, Promise<string[]>>();
const inflightRich = new Map<string, Promise<RecordingMetadata | null>>();

function cacheKey(artist: string, title: string): string {
  return `${artist.toLowerCase().trim()}|||${title.toLowerCase().trim()}`;
}

function isLegacyArrayEntry(value: unknown): value is string[] {
  return Array.isArray(value);
}

function migrateLegacyArrayEntry(value: string[]): CacheEntry {
  // Pre-Phase-1 array format. Empty arrays migrate as expired misses so they
  // get re-fetched; non-empty arrays migrate as Phase 1-style hits (no
  // richVersion, so a richer-lookup caller will trigger a refetch).
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
        if (isLegacyArrayEntry(value)) {
          migrated[key] = migrateLegacyArrayEntry(value);
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

function isCacheEntryFreshForGenre(entry: CacheEntry): boolean {
  if (entry.status === "hit") return true;
  return Date.now() - entry.cachedAt < NEGATIVE_CACHE_TTL_MS;
}

function isCacheEntryFreshForRich(entry: CacheEntry): boolean {
  // Phase 1 hits (no richVersion) need a refetch to get MBIDs and year.
  if (entry.status === "hit") return entry.richVersion === RICH_SCHEMA_VERSION;
  return Date.now() - entry.cachedAt < NEGATIVE_CACHE_TTL_MS;
}

function entryToMetadata(entry: CacheEntry): RecordingMetadata | null {
  if (entry.status === "miss") return null;
  return {
    genres: entry.genres,
    recordingMbid: entry.recordingMbid,
    releaseGroupMbid: entry.releaseGroupMbid,
    artistMbid: entry.artistMbid,
    year: entry.year
  };
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

type MBTagOrGenre = { name?: string; count?: number };
type MBArtistCredit = { artist?: { id?: string; name?: string }; joinphrase?: string };
type MBReleaseGroup = {
  id?: string;
  "first-release-date"?: string;
  "primary-type"?: string;
};
type MBRelease = {
  id?: string;
  date?: string;
  "release-group"?: MBReleaseGroup;
};

type MBRecording = {
  id?: string;
  score?: number;
  tags?: MBTagOrGenre[];
  genres?: MBTagOrGenre[];
};

type MBSearchResult = {
  recordings?: MBRecording[];
};

type MBRecordingDetail = {
  id?: string;
  genres?: MBTagOrGenre[];
  tags?: MBTagOrGenre[];
  "artist-credit"?: MBArtistCredit[];
  releases?: MBRelease[];
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

function extractYearFromDate(date: string | undefined): number | undefined {
  if (!date) return undefined;
  const match = /^(\d{4})/.exec(date);
  if (!match) return undefined;
  const year = Number.parseInt(match[1]!, 10);
  if (!Number.isInteger(year) || year < 1000 || year > 2999) return undefined;
  return year;
}

type CanonicalRelease = {
  releaseGroupMbid: string | undefined;
  year: number | undefined;
};

function pickCanonicalRelease(detail: MBRecordingDetail): CanonicalRelease {
  const releases = detail.releases ?? [];
  const albums = releases.filter(
    (r) => r["release-group"]?.["primary-type"] === "Album" && r["release-group"]?.id
  );
  const candidates = albums.length > 0
    ? albums
    : releases.filter((r) => r["release-group"]?.id);

  if (candidates.length === 0) {
    return { releaseGroupMbid: undefined, year: undefined };
  }

  let bestId: string | undefined;
  let bestYear: number | undefined;

  for (const rel of candidates) {
    const rg = rel["release-group"]!;
    const year = extractYearFromDate(rg["first-release-date"]);
    if (year !== undefined) {
      if (bestYear === undefined || year < bestYear) {
        bestYear = year;
        bestId = rg.id;
      }
    } else if (bestId === undefined) {
      bestId = rg.id;
    }
  }

  return { releaseGroupMbid: bestId, year: bestYear };
}

function extractArtistMbid(detail: MBRecordingDetail): string | undefined {
  const credits = detail["artist-credit"] ?? [];
  for (const credit of credits) {
    const id = credit.artist?.id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return undefined;
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

type DetailOutcome =
  | { kind: "ok"; detail: MBRecordingDetail }
  | { kind: "transient" }
  | { kind: "missing" };

async function fetchRecordingDetail(recordingId: string, withReleaseGroups: boolean): Promise<DetailOutcome> {
  await waitForRateLimit();

  const inc = withReleaseGroups
    ? "genres+tags+artist-credits+releases+release-groups"
    : "genres+tags";
  const detailUrl = `${MB_BASE_URL}/recording/${recordingId}?inc=${inc}&fmt=json`;
  let response: Response;
  try {
    response = await fetch(detailUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    log.warn("MusicBrainz detail fetch failed", {
      recordingId,
      error: error instanceof Error ? error.message : String(error)
    });
    return { kind: "transient" };
  }

  if (response.status >= 500 || response.status === 429) {
    return { kind: "transient" };
  }
  if (!response.ok) {
    return { kind: "missing" };
  }

  try {
    const detail = (await response.json()) as MBRecordingDetail;
    return { kind: "ok", detail };
  } catch (error) {
    log.warn("MusicBrainz detail returned invalid JSON", {
      recordingId,
      error: error instanceof Error ? error.message : String(error)
    });
    return { kind: "transient" };
  }
}

type LookupGenreResult =
  | { kind: "resolved"; genres: string[]; status: "hit" | "miss" }
  | { kind: "transient" };

type LookupRichResult =
  | { kind: "resolved"; metadata: RecordingMetadata | null }
  | { kind: "transient" };

async function lookupGenresUncached(artist: string, title: string): Promise<LookupGenreResult> {
  const passes = buildTitlePasses(title);

  for (const candidateTitle of passes) {
    const outcome = await searchRecording(artist, candidateTitle);
    if (outcome.kind === "transient") return { kind: "transient" };
    if (outcome.kind === "miss") continue;

    const fromSearch = extractGenres(outcome.recording);
    if (fromSearch.length > 0) {
      return { kind: "resolved", genres: fromSearch, status: "hit" };
    }

    if (!outcome.recording.id) continue;

    const detail = await fetchRecordingDetail(outcome.recording.id, false);
    if (detail.kind === "transient") return { kind: "transient" };
    if (detail.kind === "missing") continue;

    const fromDetail = extractGenres(detail.detail);
    if (fromDetail.length > 0) {
      return { kind: "resolved", genres: fromDetail, status: "hit" };
    }
  }

  return { kind: "resolved", genres: [], status: "miss" };
}

async function lookupRecordingMetadataUncached(artist: string, title: string): Promise<LookupRichResult> {
  const passes = buildTitlePasses(title);

  for (const candidateTitle of passes) {
    const outcome = await searchRecording(artist, candidateTitle);
    if (outcome.kind === "transient") return { kind: "transient" };
    if (outcome.kind === "miss") continue;
    if (!outcome.recording.id) continue;

    const detail = await fetchRecordingDetail(outcome.recording.id, true);
    if (detail.kind === "transient") return { kind: "transient" };
    if (detail.kind === "missing") continue;

    const genres = (() => {
      const fromSearch = extractGenres(outcome.recording);
      if (fromSearch.length > 0) return fromSearch;
      return extractGenres(detail.detail);
    })();
    const { releaseGroupMbid, year } = pickCanonicalRelease(detail.detail);
    const artistMbid = extractArtistMbid(detail.detail);

    return {
      kind: "resolved",
      metadata: {
        genres,
        recordingMbid: outcome.recording.id,
        releaseGroupMbid,
        artistMbid,
        year
      }
    };
  }

  return { kind: "resolved", metadata: null };
}

function recordingMetadataFromDetail(
  recordingMbid: string,
  detail: MBRecordingDetail
): RecordingMetadata {
  const genres = extractGenres(detail);
  const { releaseGroupMbid, year } = pickCanonicalRelease(detail);
  const artistMbid = extractArtistMbid(detail);
  return { genres, recordingMbid, releaseGroupMbid, artistMbid, year };
}

/**
 * Fetch rich metadata (genres, release-group, year, artist MBID) for a known
 * recording MBID. Used by the AcoustID fingerprint fallback path: when the
 * artist/title search misses but a fingerprint resolves to a recording, we
 * still want the same downstream metadata.
 *
 * Cached under a `mbid:` key so repeated MBID lookups are deduped, but uses
 * the same on-disk cache file as the artist/title path. Misses are NOT
 * cached because we only get here for confirmed-via-fingerprint MBIDs.
 */
export async function lookupRecordingMetadataByMbid(recordingMbid: string): Promise<RecordingMetadata | null> {
  if (!recordingMbid.trim()) return null;

  const c = loadCache();
  const key = `mbid:${recordingMbid.toLowerCase().trim()}`;
  const existing = c[key];
  if (existing && isCacheEntryFreshForRich(existing)) {
    return entryToMetadata(existing);
  }

  const inflightPromise = inflightRich.get(key);
  if (inflightPromise) return inflightPromise;

  const promise = (async (): Promise<RecordingMetadata | null> => {
    try {
      const detail = await fetchRecordingDetail(recordingMbid, true);
      if (detail.kind !== "ok") return null;
      const metadata = recordingMetadataFromDetail(recordingMbid, detail.detail);
      c[key] = {
        cachedAt: Date.now(),
        status: "hit",
        richVersion: RICH_SCHEMA_VERSION,
        genres: metadata.genres,
        recordingMbid: metadata.recordingMbid,
        releaseGroupMbid: metadata.releaseGroupMbid,
        artistMbid: metadata.artistMbid,
        year: metadata.year
      };
      scheduleCacheSave();
      return metadata;
    } finally {
      inflightRich.delete(key);
    }
  })();

  inflightRich.set(key, promise);
  return promise;
}

function buildTitlePasses(title: string): string[] {
  const passes: string[] = [title];
  const simplified = simplifyTitle(title);
  if (simplified && simplified.toLowerCase() !== title.toLowerCase()) {
    passes.push(simplified);
  }
  return passes;
}

export function lookupGenre(artist: string, title: string): Promise<string[]> {
  if (!artist.trim() || !title.trim()) {
    return Promise.resolve([]);
  }

  const c = loadCache();
  const key = cacheKey(artist, title);

  const existing = c[key];
  if (existing && isCacheEntryFreshForGenre(existing)) {
    return Promise.resolve(existing.genres);
  }

  const inflightPromise = inflightGenre.get(key);
  if (inflightPromise) return inflightPromise;

  const promise = (async (): Promise<string[]> => {
    try {
      const result = await lookupGenresUncached(artist, title);
      if (result.kind === "transient") return [];
      const previous = c[key];
      c[key] = {
        ...previous,
        genres: result.genres,
        cachedAt: Date.now(),
        status: result.status
      };
      scheduleCacheSave();
      return result.genres;
    } finally {
      inflightGenre.delete(key);
    }
  })();

  inflightGenre.set(key, promise);
  return promise;
}

export function lookupRecordingMetadata(artist: string, title: string): Promise<RecordingMetadata | null> {
  if (!artist.trim() || !title.trim()) {
    return Promise.resolve(null);
  }

  const c = loadCache();
  const key = cacheKey(artist, title);

  const existing = c[key];
  if (existing && isCacheEntryFreshForRich(existing)) {
    return Promise.resolve(entryToMetadata(existing));
  }

  const inflightPromise = inflightRich.get(key);
  if (inflightPromise) return inflightPromise;

  const promise = (async (): Promise<RecordingMetadata | null> => {
    try {
      const result = await lookupRecordingMetadataUncached(artist, title);
      if (result.kind === "transient") return null;
      c[key] = {
        cachedAt: Date.now(),
        status: result.metadata ? "hit" : "miss",
        richVersion: RICH_SCHEMA_VERSION,
        genres: result.metadata?.genres ?? [],
        recordingMbid: result.metadata?.recordingMbid,
        releaseGroupMbid: result.metadata?.releaseGroupMbid,
        artistMbid: result.metadata?.artistMbid,
        year: result.metadata?.year
      };
      scheduleCacheSave();
      return result.metadata;
    } finally {
      inflightRich.delete(key);
    }
  })();

  inflightRich.set(key, promise);
  return promise;
}

export function getGenreCacheStats(): { entries: number } {
  const c = loadCache();
  return { entries: Object.keys(c).length };
}

export function clearGenreCache(): void {
  cache = {};
  inflightGenre.clear();
  inflightRich.clear();
  cacheDirty = true;
  flushCacheNow();
}

export function flushGenreCache(): void {
  flushCacheNow();
}

export function invalidateCacheEntry(artist: string, title: string): boolean {
  if (!artist.trim() || !title.trim()) return false;
  const c = loadCache();
  const key = cacheKey(artist, title);
  if (!(key in c)) return false;
  delete c[key];
  cacheDirty = true;
  scheduleCacheSave();
  return true;
}
