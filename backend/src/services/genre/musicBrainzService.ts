/**
 * MusicBrainz lookup service with on-disk caching.
 *
 * Three lookup entry points, all writing into the same cache file but
 * under distinct key namespaces:
 *
 *   - `lookupGenre(artist, title)` — legacy genres-only lookup. Cached
 *     under `<artist>|||<title>`. Returns genres for upload-time
 *     enrichment hooks that don't need MBIDs/year.
 *   - `lookupRecordingMetadata(artist, title)` — full recording lookup
 *     (genres + MBIDs + year). Cached under the same key as above but
 *     entries carry `richVersion`. Phase-1 genre-only hits trigger a
 *     refetch when a rich caller asks.
 *   - `lookupReleaseGroup(artist, album)` — album-cohort lookup (one MB
 *     round-trip per album). Cached under `rg:<artist>|||<album>`.
 *   - `lookupRecordingMetadataByMbid(mbid)` — direct MBID lookup used by
 *     the AcoustID fingerprint fallback and the "fast path" when an
 *     override already has a stored MBID. Cached under `mbid:<mbid>`;
 *     misses are NOT cached (we only get here for confirmed MBIDs).
 *
 * Caching invariants:
 *   - Hits are kept forever (within `richVersion` compatibility).
 *   - Misses get a 7-day TTL so we eventually retry.
 *   - Writes go through a debounced flush (`CACHE_FLUSH_DEBOUNCE_MS`) +
 *     atomic rename to avoid torn files.
 *   - In-flight promises are deduped via `inflightGenre` / `inflightRich`.
 *
 * Networking:
 *   - Rate-limited to one request every `RATE_LIMIT_MS` per the MB ToS.
 *   - 5xx / 429 / network throws get one retry with backoff, honoring
 *     `Retry-After` on 429.
 */

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

// Retry policy for 5xx / 429 / network throws. One retry only — the
// MusicBrainz API is fragile under load and aggressive retries just
// chew through our rate-limit budget.
const MAX_RETRIES = 1;
const BACKOFF_BASE_MS = 1000;
const MAX_RETRY_AFTER_MS = 30_000;

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

export type ReleaseGroupMetadata = {
  releaseGroupMbid: string;
  year: number | undefined;
  genres: string[];
  artistMbid: string | undefined;
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

/**
 * Write a rich-schema cache entry. Handles both the hit and miss case
 * (pass `null` for miss). Caller is responsible for cache-key namespacing
 * (`mbid:` / `rg:` / bare artist|||title).
 */
function writeRichCacheEntry(key: string, metadata: RecordingMetadata | null): void {
  const c = loadCache();
  c[key] = {
    cachedAt: Date.now(),
    status: metadata ? "hit" : "miss",
    richVersion: RICH_SCHEMA_VERSION,
    genres: metadata?.genres ?? [],
    recordingMbid: metadata?.recordingMbid,
    releaseGroupMbid: metadata?.releaseGroupMbid,
    artistMbid: metadata?.artistMbid,
    year: metadata?.year
  };
  scheduleCacheSave();
}

/**
 * Project a `RecordingMetadata` (the shared cache value shape) down to a
 * `ReleaseGroupMetadata`. Returns null when the release-group MBID is
 * absent, since the album-cohort callers can't do anything useful
 * without it.
 */
function toReleaseGroupMetadata(m: RecordingMetadata | null): ReleaseGroupMetadata | null {
  if (!m || !m.releaseGroupMbid) return null;
  return {
    releaseGroupMbid: m.releaseGroupMbid,
    year: m.year,
    genres: m.genres,
    artistMbid: m.artistMbid
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

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1000), MAX_RETRY_AFTER_MS);
  }
  const epochMs = Date.parse(header);
  if (Number.isFinite(epochMs)) {
    return Math.min(Math.max(0, epochMs - Date.now()), MAX_RETRY_AFTER_MS);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FetchOutcome =
  | { kind: "ok"; response: Response }
  | { kind: "client-error"; response: Response }
  | { kind: "transient" };

/**
 * Fetch a MusicBrainz endpoint with one retry on 5xx / 429 / network
 * throw. Honors the Retry-After header on 429. Returns ok/client-error
 * for any non-retryable response, and "transient" only after retries are
 * exhausted (or capped by MAX_RETRY_AFTER_MS).
 */
async function fetchMbWithRetry(url: string, logContext: Record<string, unknown>): Promise<FetchOutcome> {
  let lastNetworkError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      lastNetworkError = error as Error;
      if (attempt < MAX_RETRIES) {
        const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempt);
        log.warn(`MusicBrainz fetch threw, retrying in ${delayMs}ms`, {
          ...logContext,
          error: lastNetworkError.message
        });
        await sleep(delayMs);
        continue;
      }
      break;
    }

    if (response.status >= 500 || response.status === 429) {
      if (attempt < MAX_RETRIES) {
        const retryAfter = parseRetryAfterMs(response.headers.get("retry-after"));
        const delayMs = retryAfter ?? (BACKOFF_BASE_MS * Math.pow(2, attempt));
        log.warn(`MusicBrainz returned ${response.status}, retrying in ${delayMs}ms`, logContext);
        await sleep(delayMs);
        // re-pace the rate limiter; the next call will respect RATE_LIMIT_MS again
        lastRequestTime = Date.now();
        continue;
      }
      log.warn(`MusicBrainz returned ${response.status} after retries`, logContext);
      return { kind: "transient" };
    }

    if (!response.ok) {
      return { kind: "client-error", response };
    }

    return { kind: "ok", response };
  }

  if (lastNetworkError) {
    log.warn("MusicBrainz fetch failed after retries", {
      ...logContext,
      error: lastNetworkError.message
    });
  }
  return { kind: "transient" };
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

function casifyGenreLabel(raw: string): string {
  // If MB returned mixed-case (e.g. "R&B", "IDM", "J-Pop"), trust it.
  // If it's all-lowercase (e.g. "rock", "hip hop"), title-case each
  // space-separated word, preserving hyphens (so "hip-hop" → "Hip-Hop").
  const trimmed = raw.trim();
  if (trimmed !== trimmed.toLowerCase()) {
    return trimmed;
  }
  return trimmed
    .split(/\s+/)
    .map((word) =>
      word
        .split("-")
        .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join("-")
    )
    .join(" ");
}

function extractGenres(recording: MBRecording | MBRecordingDetail): string[] {
  const genres: string[] = [];
  const seen = new Set<string>();

  const sources = [recording.genres ?? [], recording.tags ?? []];
  for (const source of sources) {
    for (const entry of source) {
      if (typeof entry.name !== "string" || !entry.name.trim()) continue;
      const lookupKey = entry.name.trim().toLowerCase();
      if (seen.has(lookupKey)) continue;
      seen.add(lookupKey);
      genres.push(casifyGenreLabel(entry.name));
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

  const outcome = await fetchMbWithRetry(searchUrl, { artist, title });
  if (outcome.kind === "transient") return { kind: "transient" };
  if (outcome.kind === "client-error") {
    log.warn(`MusicBrainz search returned ${outcome.response.status}`, { artist, title });
    return { kind: "miss" };
  }

  let searchData: MBSearchResult;
  try {
    searchData = (await outcome.response.json()) as MBSearchResult;
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

  const outcome = await fetchMbWithRetry(detailUrl, { recordingId });
  if (outcome.kind === "transient") return { kind: "transient" };
  if (outcome.kind === "client-error") return { kind: "missing" };

  try {
    const detail = (await outcome.response.json()) as MBRecordingDetail;
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

type LookupReleaseGroupResult =
  | { kind: "resolved"; metadata: ReleaseGroupMetadata | null }
  | { kind: "transient" };

type MBReleaseGroupSearchEntry = {
  id?: string;
  score?: number;
  "first-release-date"?: string;
  "primary-type"?: string;
};

type MBReleaseGroupSearchResult = {
  "release-groups"?: MBReleaseGroupSearchEntry[];
};

type MBReleaseGroupDetail = {
  id?: string;
  "first-release-date"?: string;
  "primary-type"?: string;
  genres?: MBTagOrGenre[];
  tags?: MBTagOrGenre[];
  "artist-credit"?: MBArtistCredit[];
};

type ReleaseGroupSearchOutcome =
  | { kind: "hit"; entry: MBReleaseGroupSearchEntry }
  | { kind: "miss" }
  | { kind: "transient" };

async function searchReleaseGroup(artist: string, album: string): Promise<ReleaseGroupSearchOutcome> {
  await waitForRateLimit();

  const query = `releasegroup:"${escapeLucene(album)}" AND artist:"${escapeLucene(artist)}"`;
  const url = `${MB_BASE_URL}/release-group?query=${encodeURIComponent(query)}&fmt=json&limit=${RECORDING_SEARCH_LIMIT}`;

  const outcome = await fetchMbWithRetry(url, { artist, album });
  if (outcome.kind === "transient") return { kind: "transient" };
  if (outcome.kind === "client-error") {
    log.warn(`MusicBrainz release-group search returned ${outcome.response.status}`, { artist, album });
    return { kind: "miss" };
  }

  let payload: MBReleaseGroupSearchResult;
  try {
    payload = (await outcome.response.json()) as MBReleaseGroupSearchResult;
  } catch (error) {
    log.warn("MusicBrainz release-group search returned invalid JSON", {
      artist,
      album,
      error: error instanceof Error ? error.message : String(error)
    });
    return { kind: "transient" };
  }

  const entries = payload["release-groups"] ?? [];
  // Prefer Album-type matches with score >= threshold; fall back to any
  // matching primary type that still meets the score threshold.
  const albums = entries.filter(
    (e) => typeof e.score === "number" && e.score >= MIN_SCORE_THRESHOLD && e["primary-type"] === "Album"
  );
  const pool = albums.length > 0
    ? albums
    : entries.filter((e) => typeof e.score === "number" && e.score >= MIN_SCORE_THRESHOLD);

  const best = pool.find((e) => typeof e.id === "string" && e.id.length > 0);
  if (!best) return { kind: "miss" };
  return { kind: "hit", entry: best };
}

async function fetchReleaseGroupDetail(rgMbid: string): Promise<MBReleaseGroupDetail | null> {
  await waitForRateLimit();
  const url = `${MB_BASE_URL}/release-group/${rgMbid}?inc=genres+tags+artist-credits&fmt=json`;
  const outcome = await fetchMbWithRetry(url, { rgMbid });
  if (outcome.kind !== "ok") return null;
  try {
    return (await outcome.response.json()) as MBReleaseGroupDetail;
  } catch {
    return null;
  }
}

function releaseGroupCacheKey(artist: string, album: string): string {
  return `rg:${artist.toLowerCase().trim()}|||${album.toLowerCase().trim()}`;
}

async function lookupReleaseGroupUncached(artist: string, album: string): Promise<LookupReleaseGroupResult> {
  const passes: string[] = [album];
  const simplified = simplifyTitle(album);
  if (simplified && simplified.toLowerCase() !== album.toLowerCase()) {
    passes.push(simplified);
  }

  for (const candidate of passes) {
    const outcome = await searchReleaseGroup(artist, candidate);
    if (outcome.kind === "transient") return { kind: "transient" };
    if (outcome.kind === "miss") continue;
    const rgMbid = outcome.entry.id!;

    // Prefer detail genres + artist-credit; if detail call fails, fall back
    // to the search result's first-release-date for at least the year.
    const detail = await fetchReleaseGroupDetail(rgMbid);
    const year =
      extractYearFromDate(detail?.["first-release-date"]) ??
      extractYearFromDate(outcome.entry["first-release-date"]);
    const genres = detail ? extractGenres(detail) : [];
    const artistMbid = detail ? extractArtistMbid(detail) : undefined;

    return {
      kind: "resolved",
      metadata: { releaseGroupMbid: rgMbid, year, genres, artistMbid }
    };
  }

  return { kind: "resolved", metadata: null };
}

/**
 * Look up a release-group by (artist, album). Returns the canonical
 * release-group MBID, its first-release year, album-level genres, and
 * the credited artist MBID — enough to fill the year/cover/MBID slots
 * for every track on the album with a single MusicBrainz round-trip.
 *
 * Per-recording specifics (recordingMbid, recording-level genres) still
 * require the per-track path; this is meant as a coarse-grained
 * complement to lookupRecordingMetadata.
 */
export function lookupReleaseGroup(artist: string, album: string): Promise<ReleaseGroupMetadata | null> {
  if (!artist.trim() || !album.trim()) return Promise.resolve(null);

  const c = loadCache();
  const key = releaseGroupCacheKey(artist, album);
  const existing = c[key];
  if (existing && isCacheEntryFreshForRich(existing)) {
    return Promise.resolve(toReleaseGroupMetadata(entryToMetadata(existing)));
  }

  const inflightPromise = inflightRich.get(key);
  if (inflightPromise) {
    return inflightPromise.then(toReleaseGroupMetadata);
  }

  const promise = (async (): Promise<RecordingMetadata | null> => {
    try {
      const result = await lookupReleaseGroupUncached(artist, album);
      if (result.kind === "transient") return null;
      // ReleaseGroupMetadata is a strict subset of RecordingMetadata
      // (no recordingMbid). Store under the rg: key; readers project
      // back down via toReleaseGroupMetadata.
      const asRecording: RecordingMetadata | null = result.metadata
        ? {
            genres: result.metadata.genres,
            releaseGroupMbid: result.metadata.releaseGroupMbid,
            artistMbid: result.metadata.artistMbid,
            year: result.metadata.year
          }
        : null;
      writeRichCacheEntry(key, asRecording);
      return asRecording;
    } finally {
      inflightRich.delete(key);
    }
  })();

  inflightRich.set(key, promise);
  return promise.then(toReleaseGroupMetadata);
}

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
      writeRichCacheEntry(key, metadata);
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
      writeRichCacheEntry(key, result.metadata);
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

export function invalidateMbidCacheEntry(recordingMbid: string): boolean {
  if (!recordingMbid.trim()) return false;
  const c = loadCache();
  const key = `mbid:${recordingMbid.toLowerCase().trim()}`;
  if (!(key in c)) return false;
  delete c[key];
  cacheDirty = true;
  scheduleCacheSave();
  return true;
}
