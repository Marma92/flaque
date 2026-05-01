import fs from "node:fs/promises";
import path from "node:path";

import { createLogger } from "../../utils/logger";
import { dataRoot } from "../../utils/paths";
import { ensureDir, readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { normalizeGenreLabel } from "../genre/genreSynonymService";
import type { Track } from "../../types/library";
import { AutoTraceBuilder, type AutoTrace } from "./playlistTrace";

const log = createLogger("auto-playlists");

const AUTO_PLAYLISTS_DIR = path.join(dataRoot, "auto-playlists");
const META_FILE = path.join(AUTO_PLAYLISTS_DIR, "_meta.json");
const TRACE_FILE = path.join(AUTO_PLAYLISTS_DIR, "_trace.json");
const CONFIG_FILE = path.join(dataRoot, "config", "auto-playlist-config.json");

const REGENERATION_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

// ── Types ──────────────────────────────────────────────────────────

export type AutoAxis = "decade-genre" | "genre-tempo";

export type TempoBucket = "slow" | "mid" | "driving" | "fast";

export type AutoPlaylist = {
  id: string;
  name: string;
  genre: string;
  /** Present for decade-genre axis playlists. 0 for genre-tempo axis. */
  decade: number;
  axis?: AutoAxis;
  tempo?: TempoBucket;
  trackIds: string[];
  trackCount: number;
  generatedAt: string;
  colors: [string, string, string];
  gradientAngle: number;
  /** Up to 4 cover paths picked from representative tracks; empty if none. */
  mosaicCovers?: string[];
};

export type AutoPlaylistConfig = {
  maxPlaylists: number;
  minTracksPerPlaylist: number;
  tracksPerPlaylist: number;
};

type AutoPlaylistMeta = {
  lastGeneratedAt: string;
};

// ── Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AutoPlaylistConfig = {
  maxPlaylists: 0,
  minTracksPerPlaylist: 8,
  tracksPerPlaylist: 30
};

export async function getAutoPlaylistConfig(): Promise<AutoPlaylistConfig> {
  const raw = await readJsonFile<Partial<AutoPlaylistConfig>>(CONFIG_FILE, {});
  return {
    maxPlaylists: typeof raw.maxPlaylists === "number" && raw.maxPlaylists >= 0
      ? raw.maxPlaylists : DEFAULT_CONFIG.maxPlaylists,
    minTracksPerPlaylist: typeof raw.minTracksPerPlaylist === "number" && raw.minTracksPerPlaylist >= 1
      ? raw.minTracksPerPlaylist : DEFAULT_CONFIG.minTracksPerPlaylist,
    tracksPerPlaylist: typeof raw.tracksPerPlaylist === "number" && raw.tracksPerPlaylist >= 1
      ? raw.tracksPerPlaylist : DEFAULT_CONFIG.tracksPerPlaylist
  };
}

export async function updateAutoPlaylistConfig(patch: Partial<AutoPlaylistConfig>): Promise<AutoPlaylistConfig> {
  const current = await getAutoPlaylistConfig();
  const next: AutoPlaylistConfig = {
    maxPlaylists: typeof patch.maxPlaylists === "number" && patch.maxPlaylists >= 0
      ? patch.maxPlaylists : current.maxPlaylists,
    minTracksPerPlaylist: typeof patch.minTracksPerPlaylist === "number" && patch.minTracksPerPlaylist >= 1
      ? patch.minTracksPerPlaylist : current.minTracksPerPlaylist,
    tracksPerPlaylist: typeof patch.tracksPerPlaylist === "number" && patch.tracksPerPlaylist >= 1
      ? patch.tracksPerPlaylist : current.tracksPerPlaylist
  };
  await writeJsonAtomic(CONFIG_FILE, next);
  return next;
}

// ── Diversity selection ────────────────────────────────────────────

type ScoredTrack = {
  track: Track;
  artist: string;
  album: string;
};

function selectDiverseTracks(candidates: ScoredTrack[], maxTracks: number): Track[] {
  const pool = [...candidates].sort(() => Math.random() - 0.5);
  const selected: ScoredTrack[] = [];

  while (selected.length < maxTracks && pool.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i]!;
      let score = 100;

      const prev = selected[selected.length - 1];
      if (prev) {
        if (prev.artist === candidate.artist) score -= 1000;
        if (prev.album === candidate.album) score -= 500;
      }

      const recentArtists = selected.slice(-3).map((s) => s.artist);
      if (recentArtists.includes(candidate.artist)) score -= 250;

      score += Math.random() * 40;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    selected.push(pool[bestIndex]!);
    pool.splice(bestIndex, 1);
  }

  return selected.map((s) => s.track);
}

// ── Generation ─────────────────────────────────────────────────────

function toDecadeLabel(decade: number): string {
  return `${decade % 100 === 0 ? decade : decade % 100}s`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function randomGradientColors(): [string, string, string] {
  const hue = Math.floor(Math.random() * 360);
  const offsets = [0, 40 + Math.floor(Math.random() * 40), 160 + Math.floor(Math.random() * 80)];
  return offsets.map((offset) => {
    const h = (hue + offset) % 360;
    const s = 55 + Math.floor(Math.random() * 25);
    const l = 45 + Math.floor(Math.random() * 20);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }) as [string, string, string];
}

/**
 * Bucket a BPM into one of four tempo bands. Boundaries follow the common
 * guideline: slow up to 89 BPM (ballads), mid 90-119 (pop/midtempo), driving
 * 120-139 (dance/rock), fast 140+ (drum & bass / punk / fast house).
 */
export function bpmBucket(bpm: number | undefined): TempoBucket | null {
  if (typeof bpm !== "number" || !Number.isFinite(bpm) || bpm <= 0) return null;
  if (bpm < 90) return "slow";
  if (bpm < 120) return "mid";
  if (bpm < 140) return "driving";
  return "fast";
}

const TEMPO_LABELS: Record<TempoBucket, string> = {
  slow: "Slow",
  mid: "Midtempo",
  driving: "Driving",
  fast: "Fast"
};

/**
 * Pick up to N distinct album covers from the playlist's tracks for a mosaic.
 * Prefers covers from different albums and returns them in deterministic order
 * (by appearance in the input). Returns an empty array if no track has a cover.
 */
export function pickMosaicCovers(tracks: Track[], max = 4): string[] {
  const seen = new Set<string>();
  const seenAlbums = new Set<string>();
  const covers: string[] = [];

  for (const track of tracks) {
    if (covers.length >= max) break;
    const cover = track.cover;
    if (!cover || seen.has(cover)) continue;
    const albumKey = (track.tags.album ?? "").toLowerCase();
    if (albumKey && seenAlbums.has(albumKey)) continue;
    covers.push(cover);
    seen.add(cover);
    if (albumKey) seenAlbums.add(albumKey);
  }

  // Second pass: if we still need more, accept duplicate albums but distinct covers.
  if (covers.length < max) {
    for (const track of tracks) {
      if (covers.length >= max) break;
      const cover = track.cover;
      if (!cover || seen.has(cover)) continue;
      covers.push(cover);
      seen.add(cover);
    }
  }

  return covers;
}

export type AutoGenerationResult = {
  playlists: AutoPlaylist[];
  trace: AutoTrace;
};

export async function generateAutoPlaylists(tracks: Track[]): Promise<AutoPlaylist[]> {
  const result = await generateAutoPlaylistsWithTrace(tracks);
  return result.playlists;
}

type GroupBucket = {
  key: string;
  axis: AutoAxis;
  genre: string;
  decade: number;
  tempo?: TempoBucket;
  tracks: ScoredTrack[];
};

function makeScored(track: Track): ScoredTrack {
  return {
    track,
    artist: (track.tags.artist ?? "").toLowerCase(),
    album: (track.tags.album ?? "").toLowerCase()
  };
}

export async function generateAutoPlaylistsWithTrace(tracks: Track[]): Promise<AutoGenerationResult> {
  const config = await getAutoPlaylistConfig();
  const builder = new AutoTraceBuilder();

  const groups = new Map<string, GroupBucket>();
  // A track contributes to the candidate count if it can land in *any* group
  // (i.e. has at least one genre and at least one of year or BPM).
  const candidateTrackIds = new Set<string>();

  for (const track of tracks) {
    const genres = track.tags.genre;
    if (!genres || genres.length === 0) continue;

    const year = track.tags.year;
    const tempo = bpmBucket(track.tags.bpm);
    if (!year && !tempo) continue;

    candidateTrackIds.add(track.id);
    const scored = makeScored(track);

    // Iterate every genre on the track (multi-presence). Tracks tagged with
    // multiple genres show up in each corresponding group instead of being
    // bound to genres[0].
    const seenGenreKeys = new Set<string>();
    for (const rawGenre of genres) {
      const genre = normalizeGenreLabel(rawGenre);
      const genreKey = genre.toLowerCase();
      if (seenGenreKeys.has(genreKey)) continue;
      seenGenreKeys.add(genreKey);

      if (year) {
        const decade = Math.floor(year / 10) * 10;
        const key = `decade-genre|${decade}|${genreKey}`;
        let group = groups.get(key);
        if (!group) {
          group = { key, axis: "decade-genre", genre, decade, tracks: [] };
          groups.set(key, group);
        }
        group.tracks.push(scored);
      }

      if (tempo) {
        const key = `genre-tempo|${genreKey}|${tempo}`;
        let group = groups.get(key);
        if (!group) {
          group = { key, axis: "genre-tempo", genre, decade: 0, tempo, tracks: [] };
          groups.set(key, group);
        }
        group.tracks.push(scored);
      }
    }
  }

  builder.setTotalCandidateTracks(candidateTrackIds.size);
  builder.setTotalGroups(groups.size);

  const allGroups = [...groups.values()];
  const qualifying = allGroups
    .filter((g) => g.tracks.length >= config.minTracksPerPlaylist)
    .sort((a, b) => b.tracks.length - a.tracks.length);

  const cutoff = config.maxPlaylists > 0 ? config.maxPlaylists : qualifying.length;
  const selected = qualifying.slice(0, cutoff);
  const selectedKeys = new Set(selected.map((g) => g.key));
  builder.setQualifyingGroups(qualifying.length);

  const generatedAt = new Date().toISOString();
  const playlists: AutoPlaylist[] = [];
  const mosaicCountByKey = new Map<string, number>();

  for (const group of selected) {
    const name =
      group.axis === "decade-genre"
        ? `${toDecadeLabel(group.decade)} ${group.genre}`
        : `${TEMPO_LABELS[group.tempo!]} ${group.genre}`;
    const id = `auto:${slugify(name)}`;
    const selectedTracks = selectDiverseTracks(group.tracks, config.tracksPerPlaylist);
    const mosaic = pickMosaicCovers(selectedTracks);
    mosaicCountByKey.set(group.key, mosaic.length);

    playlists.push({
      id,
      name,
      genre: group.genre,
      decade: group.decade,
      axis: group.axis,
      ...(group.tempo ? { tempo: group.tempo } : {}),
      trackIds: selectedTracks.map((t) => t.id),
      trackCount: selectedTracks.length,
      generatedAt,
      colors: randomGradientColors(),
      gradientAngle: Math.floor(Math.random() * 360),
      ...(mosaic.length > 0 ? { mosaicCovers: mosaic } : {})
    });
  }

  for (const g of allGroups) {
    let rejection: string | undefined;
    if (g.tracks.length < config.minTracksPerPlaylist) rejection = "below-min-tracks";
    else if (!selectedKeys.has(g.key)) rejection = "above-max-playlists";

    builder.recordGroup({
      key: g.key,
      axis: g.axis,
      genre: g.genre,
      decade: g.decade,
      ...(g.tempo ? { tempo: g.tempo } : {}),
      trackCount: g.tracks.length,
      selected: selectedKeys.has(g.key),
      ...(mosaicCountByKey.has(g.key) ? { mosaicCoverCount: mosaicCountByKey.get(g.key) } : {}),
      ...(rejection ? { rejection } : {})
    });
  }

  builder.setGeneratedPlaylists(playlists.length);
  return { playlists, trace: builder.build() };
}

// ── Storage ────────────────────────────────────────────────────────

export async function saveAutoPlaylists(playlists: AutoPlaylist[]): Promise<void> {
  await ensureDir(AUTO_PLAYLISTS_DIR);

  const existing = await fs.readdir(AUTO_PLAYLISTS_DIR).catch(() => []);
  for (const file of existing) {
    if (file.endsWith(".json") && file !== "_meta.json" && file !== "_trace.json") {
      await fs.unlink(path.join(AUTO_PLAYLISTS_DIR, file)).catch(() => {});
    }
  }

  for (const playlist of playlists) {
    const fileName = `${slugify(playlist.name)}.json`;
    await writeJsonAtomic(path.join(AUTO_PLAYLISTS_DIR, fileName), playlist);
  }

  const meta: AutoPlaylistMeta = { lastGeneratedAt: new Date().toISOString() };
  await writeJsonAtomic(META_FILE, meta);

  log.info(`Saved ${playlists.length} auto playlist(s)`);
}

export async function saveAutoTrace(trace: AutoTrace): Promise<void> {
  await ensureDir(AUTO_PLAYLISTS_DIR);
  await writeJsonAtomic(TRACE_FILE, trace);
}

export async function loadAutoTrace(): Promise<AutoTrace | null> {
  const data = await readJsonFile<AutoTrace>(TRACE_FILE, null as unknown as AutoTrace);
  if (!data || typeof data !== "object" || typeof data.durationMs !== "number") return null;
  return data;
}

export async function loadAutoPlaylists(): Promise<AutoPlaylist[]> {
  await ensureDir(AUTO_PLAYLISTS_DIR);

  const files = await fs.readdir(AUTO_PLAYLISTS_DIR).catch(() => []);
  const playlists: AutoPlaylist[] = [];

  for (const file of files) {
    if (!file.endsWith(".json") || file === "_meta.json" || file === "_trace.json") continue;
    const data = await readJsonFile<AutoPlaylist>(
      path.join(AUTO_PLAYLISTS_DIR, file),
      null as unknown as AutoPlaylist
    );
    if (data && data.id && data.trackIds) {
      if (!data.colors) data.colors = randomGradientColors();
      if (data.gradientAngle === undefined) data.gradientAngle = Math.floor(Math.random() * 360);
      playlists.push(data);
    }
  }

  return playlists.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAutoPlaylistById(id: string): Promise<AutoPlaylist | null> {
  const all = await loadAutoPlaylists();
  return all.find((p) => p.id === id) ?? null;
}

// ── Regeneration check ─────────────────────────────────────────────

export async function needsRegeneration(): Promise<boolean> {
  const meta = await readJsonFile<AutoPlaylistMeta>(META_FILE, { lastGeneratedAt: "" });
  if (!meta.lastGeneratedAt) return true;

  const lastGenerated = new Date(meta.lastGeneratedAt).getTime();
  if (isNaN(lastGenerated)) return true;

  return Date.now() - lastGenerated > REGENERATION_INTERVAL_MS;
}

export async function regenerateAutoPlaylists(tracks: Track[]): Promise<AutoPlaylist[]> {
  log.info("Regenerating auto playlists...");
  const { playlists, trace } = await generateAutoPlaylistsWithTrace(tracks);
  await saveAutoPlaylists(playlists);
  await saveAutoTrace(trace);
  log.info(
    `auto: candidates=${trace.totalCandidateTracks} groups=${trace.totalGroups} ` +
      `qualifying=${trace.qualifyingGroups} playlists=${playlists.length} durationMs=${trace.durationMs}`
  );
  return playlists;
}

export async function checkAndRegenerateOnBoot(tracks: Track[]): Promise<void> {
  const shouldRegenerate = await needsRegeneration();
  if (!shouldRegenerate) {
    const existing = await loadAutoPlaylists();
    log.info(`Auto playlists up to date (${existing.length} playlist(s))`);
    return;
  }

  await regenerateAutoPlaylists(tracks);
}
