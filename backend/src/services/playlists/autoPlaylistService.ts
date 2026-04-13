import fs from "node:fs/promises";
import path from "node:path";

import { createLogger } from "../../utils/logger";
import { dataRoot } from "../../utils/paths";
import { ensureDir, readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { normalizeGenreLabel } from "../genre/genreSynonymService";
import type { Track } from "../../types/library";

const log = createLogger("auto-playlists");

const AUTO_PLAYLISTS_DIR = path.join(dataRoot, "auto-playlists");
const META_FILE = path.join(AUTO_PLAYLISTS_DIR, "_meta.json");
const CONFIG_FILE = path.join(dataRoot, "config", "auto-playlist-config.json");

const REGENERATION_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

// ── Types ──────────────────────────────────────────────────────────

export type AutoPlaylist = {
  id: string;
  name: string;
  genre: string;
  decade: number;
  trackIds: string[];
  trackCount: number;
  generatedAt: string;
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

export async function generateAutoPlaylists(tracks: Track[]): Promise<AutoPlaylist[]> {
  const config = await getAutoPlaylistConfig();

  const groups = new Map<string, { genre: string; decade: number; tracks: ScoredTrack[] }>();

  for (const track of tracks) {
    const genres = track.tags.genre;
    const year = track.tags.year;
    if (!genres || genres.length === 0 || !year) continue;

    const primaryGenre = normalizeGenreLabel(genres[0]!);
    const decade = Math.floor(year / 10) * 10;
    const key = `${decade}:${primaryGenre.toLowerCase()}`;

    let group = groups.get(key);
    if (!group) {
      group = { genre: primaryGenre, decade, tracks: [] };
      groups.set(key, group);
    }

    group.tracks.push({
      track,
      artist: (track.tags.artist ?? "").toLowerCase(),
      album: (track.tags.album ?? "").toLowerCase()
    });
  }

  let qualifyingGroups = Array.from(groups.values())
    .filter((g) => g.tracks.length >= config.minTracksPerPlaylist)
    .sort((a, b) => b.tracks.length - a.tracks.length);

  if (config.maxPlaylists > 0) {
    qualifyingGroups = qualifyingGroups.slice(0, config.maxPlaylists);
  }

  const generatedAt = new Date().toISOString();
  const playlists: AutoPlaylist[] = [];

  for (const group of qualifyingGroups) {
    const decadeLabel = toDecadeLabel(group.decade);
    const name = `${decadeLabel} ${group.genre}`;
    const id = `auto:${slugify(name)}`;
    const selectedTracks = selectDiverseTracks(group.tracks, config.tracksPerPlaylist);

    playlists.push({
      id,
      name,
      genre: group.genre,
      decade: group.decade,
      trackIds: selectedTracks.map((t) => t.id),
      trackCount: selectedTracks.length,
      generatedAt
    });
  }

  return playlists;
}

// ── Storage ────────────────────────────────────────────────────────

export async function saveAutoPlaylists(playlists: AutoPlaylist[]): Promise<void> {
  await ensureDir(AUTO_PLAYLISTS_DIR);

  const existing = await fs.readdir(AUTO_PLAYLISTS_DIR).catch(() => []);
  for (const file of existing) {
    if (file.endsWith(".json") && file !== "_meta.json") {
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

export async function loadAutoPlaylists(): Promise<AutoPlaylist[]> {
  await ensureDir(AUTO_PLAYLISTS_DIR);

  const files = await fs.readdir(AUTO_PLAYLISTS_DIR).catch(() => []);
  const playlists: AutoPlaylist[] = [];

  for (const file of files) {
    if (!file.endsWith(".json") || file === "_meta.json") continue;
    const data = await readJsonFile<AutoPlaylist>(
      path.join(AUTO_PLAYLISTS_DIR, file),
      null as unknown as AutoPlaylist
    );
    if (data && data.id && data.trackIds) {
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
  const playlists = await generateAutoPlaylists(tracks);
  await saveAutoPlaylists(playlists);
  log.info(`Generated ${playlists.length} auto playlist(s)`);
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
