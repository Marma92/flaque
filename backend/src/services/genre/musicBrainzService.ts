import fs from "node:fs";
import path from "node:path";

import { createLogger } from "../../utils/logger";
import { cacheRoot } from "../../utils/paths";

const log = createLogger("musicbrainz");

const MB_BASE_URL = "https://musicbrainz.org/ws/2";
const RATE_LIMIT_MS = 1100;
const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_FILE = path.join(cacheRoot, "musicbrainz-genre-cache.json");

function readVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const USER_AGENT = `flaque/${readVersion()} (https://github.com/Marma92/flaque)`;

type GenreCache = Record<string, string[]>;

let cache: GenreCache | null = null;
let lastRequestTime = 0;
let queue: Array<{
  artist: string;
  title: string;
  resolve: (genres: string[]) => void;
}> = [];
let processing = false;

function cacheKey(artist: string, title: string): string {
  return `${artist.toLowerCase().trim()}|||${title.toLowerCase().trim()}`;
}

function loadCache(): GenreCache {
  if (cache) return cache;

  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf8");
      cache = JSON.parse(raw) as GenreCache;
      return cache;
    }
  } catch {
    log.warn("Failed to load MusicBrainz genre cache, starting fresh");
  }

  cache = {};
  return cache;
}

function saveCache(): void {
  if (!cache) return;

  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch (error) {
    log.warn("Failed to save MusicBrainz genre cache", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
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

async function fetchGenresForRecording(artist: string, title: string): Promise<string[]> {
  await waitForRateLimit();

  const query = `recording:"${title}" AND artist:"${artist}"`;
  const searchUrl = `${MB_BASE_URL}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=3`;

  try {
    const searchResponse = await fetch(searchUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!searchResponse.ok) {
      log.warn(`MusicBrainz search returned ${searchResponse.status}`, {
        artist,
        title
      });
      return [];
    }

    const searchData = (await searchResponse.json()) as MBSearchResult;
    const recordings = searchData.recordings ?? [];

    if (recordings.length === 0) return [];

    const firstRecording = recordings[0]!;
    const searchGenres = extractGenres(firstRecording);
    if (searchGenres.length > 0) return searchGenres;

    if (!firstRecording.id) return [];

    await waitForRateLimit();

    const detailUrl = `${MB_BASE_URL}/recording/${firstRecording.id}?inc=genres+tags&fmt=json`;
    const detailResponse = await fetch(detailUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!detailResponse.ok) return [];

    const detailData = (await detailResponse.json()) as MBRecordingDetail;
    return extractGenres(detailData);
  } catch (error) {
    log.warn("MusicBrainz lookup failed", {
      artist,
      title,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const item = queue.shift()!;
    const key = cacheKey(item.artist, item.title);
    const c = loadCache();

    if (key in c) {
      item.resolve(c[key] ?? []);
      continue;
    }

    const genres = await fetchGenresForRecording(item.artist, item.title);
    c[key] = genres;
    saveCache();
    item.resolve(genres);
  }

  processing = false;
}

export function lookupGenre(artist: string, title: string): Promise<string[]> {
  if (!artist.trim() || !title.trim()) {
    return Promise.resolve([]);
  }

  const c = loadCache();
  const key = cacheKey(artist, title);
  if (key in c) {
    return Promise.resolve(c[key] ?? []);
  }

  return new Promise<string[]>((resolve) => {
    queue.push({ artist, title, resolve });
    void processQueue();
  });
}

export function getGenreCacheStats(): { entries: number } {
  const c = loadCache();
  return { entries: Object.keys(c).length };
}

export function clearGenreCache(): void {
  cache = {};
  saveCache();
}
