/**
 * Personal mixes — user-aware Auto playlists. Three variants:
 *
 *   • discovered-this-year   tracks added in the current calendar year that
 *                            the user has played at least once.
 *   • forgotten-favorites    tracks with high lifetime plays but no plays in
 *                            the recent window (default 90 days).
 *   • album-deep-cuts        tracks from albums the user has otherwise
 *                            engaged with, but hasn't played themselves.
 *
 * Storage follows the for-you pattern: file-based, per-user.
 *   data/auto-playlists/personal/<userId>/<variant>.json
 *   data/auto-playlists/personal/<userId>/_meta.json
 *   data/auto-playlists/personal/<userId>/_trace.json
 *
 * No DB; the auth layer is the only thing in the DB. Everything else here
 * is JSON files read/written atomically.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { createLogger } from "../../utils/logger";
import { dataRoot } from "../../utils/paths";
import { ensureDir, readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { getUserPlayCounts } from "../activity/playCountStore";
import { getRecentSkipCounts } from "../activity/skipStore";
import { pickMosaicCovers } from "./autoPlaylistService";
import { SKIP_HARD_FILTER_THRESHOLD } from "./forYouRanker";
import type { IndexStore } from "../indexer/indexStore";
import type { Track } from "../../types/library";
import {
  PersonalTraceBuilder,
  type PersonalTrace,
  type PersonalVariantId,
  type PersonalVariantTrace
} from "./playlistTrace";

const log = createLogger("personal-playlists");

const PERSONAL_DIR = path.join(dataRoot, "auto-playlists", "personal");
const REGENERATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const MIN_TOTAL_PLAYS = 20;
const MIN_DISTINCT_ARTISTS = 3;
const MIN_TRACKS_PER_PLAYLIST = 8;
const TRACKS_PER_PLAYLIST = 30;

const FORGOTTEN_RECENT_DAYS = 90;
const FORGOTTEN_MIN_PLAYS = 3;
const DEEP_CUTS_MIN_ALBUM_ENGAGEMENT = 2;
const DEEP_CUTS_MIN_ALBUM_TRACKS = 4;
const RECENT_SKIPS_WINDOW_DAYS = 60;

// ── Types ──────────────────────────────────────────────────────────

export type PersonalPlaylist = {
  id: string;
  variant: PersonalVariantId;
  name: string;
  description: string;
  trackIds: string[];
  trackCount: number;
  generatedAt: string;
  colors: [string, string, string];
  gradientAngle: number;
  mosaicCovers?: string[];
};

type PersonalMeta = {
  lastGeneratedAt: string;
};

// ── Paths ──────────────────────────────────────────────────────────

function userPersonalDir(userId: string): string {
  return path.join(PERSONAL_DIR, userId);
}

function userPersonalMetaPath(userId: string): string {
  return path.join(userPersonalDir(userId), "_meta.json");
}

function userPersonalTracePath(userId: string): string {
  return path.join(userPersonalDir(userId), "_trace.json");
}

// ── Style ──────────────────────────────────────────────────────────

const VARIANT_GRADIENTS: Record<PersonalVariantId, { colors: [string, string, string]; angle: number }> = {
  "discovered-this-year": {
    colors: ["hsl(195, 70%, 55%)", "hsl(220, 65%, 55%)", "hsl(260, 70%, 55%)"],
    angle: 135
  },
  "forgotten-favorites": {
    colors: ["hsl(30, 80%, 60%)", "hsl(15, 75%, 55%)", "hsl(345, 70%, 55%)"],
    angle: 145
  },
  "album-deep-cuts": {
    colors: ["hsl(160, 55%, 45%)", "hsl(190, 50%, 45%)", "hsl(220, 50%, 45%)"],
    angle: 125
  }
};

const VARIANT_LABELS: Record<PersonalVariantId, { name: string; description: string }> = {
  "discovered-this-year": {
    name: "Discovered this year",
    description: "Music you added and started playing in the last twelve months."
  },
  "forgotten-favorites": {
    name: "Forgotten favorites",
    description: "Tracks you used to love but haven't played in a while."
  },
  "album-deep-cuts": {
    name: "Album deep cuts",
    description: "Songs from albums you know, that you haven't actually played."
  }
};

// ── Diversity helper ───────────────────────────────────────────────

type ScoredTrack = {
  track: Track;
  artist: string;
  album: string;
  weight: number;
};

/**
 * Order tracks for sequencing: weight-sorted, then a deterministic adjacency
 * pass that avoids putting two same-album tracks back to back.
 */
function sequenceWeighted(scored: ScoredTrack[], maxTracks: number): Track[] {
  const sorted = [...scored].sort((a, b) => b.weight - a.weight).slice(0, maxTracks);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.album && sorted[i]!.album === sorted[i - 1]!.album) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[j]!.album !== sorted[i - 1]!.album) {
          [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
          break;
        }
      }
    }
  }
  return sorted.map((s) => s.track);
}

function makeScored(track: Track, weight: number): ScoredTrack {
  return {
    track,
    artist: (track.tags.artist ?? "").toLowerCase(),
    album: (track.tags.album ?? "").toLowerCase(),
    weight
  };
}

// ── Variant generators ─────────────────────────────────────────────

type PlayCountEntry = { count: number; lastPlayedAt: string };

function isWithinDays(iso: string, days: number, now: number): boolean {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  return now - t < days * 24 * 60 * 60 * 1000;
}

/** Tracks added this calendar year that the user has played at least once. */
function buildDiscoveredThisYear(
  playCounts: Record<string, PlayCountEntry>,
  indexStore: IndexStore,
  now: number
): { scored: ScoredTrack[]; notes: string[] } {
  const yearStart = new Date(new Date(now).getFullYear(), 0, 1).getTime();
  const scored: ScoredTrack[] = [];
  const missingAddedAt: string[] = [];

  for (const [trackId, entry] of Object.entries(playCounts)) {
    if (entry.count <= 0) continue;
    const track = indexStore.getTrackById(trackId);
    if (!track) continue;
    if (!track.addedAt) {
      missingAddedAt.push(trackId);
      continue;
    }
    const addedAt = new Date(track.addedAt).getTime();
    if (isNaN(addedAt) || addedAt < yearStart) continue;
    scored.push(makeScored(track, entry.count));
  }

  const notes: string[] = [];
  if (missingAddedAt.length > 0) {
    notes.push(`${missingAddedAt.length} candidate track(s) skipped: no addedAt timestamp`);
  }
  return { scored, notes };
}

/** High-lifetime plays but no plays in the recent window. */
function buildForgottenFavorites(
  playCounts: Record<string, PlayCountEntry>,
  indexStore: IndexStore,
  now: number
): { scored: ScoredTrack[]; notes: string[] } {
  const scored: ScoredTrack[] = [];
  for (const [trackId, entry] of Object.entries(playCounts)) {
    if (entry.count < FORGOTTEN_MIN_PLAYS) continue;
    if (isWithinDays(entry.lastPlayedAt, FORGOTTEN_RECENT_DAYS, now)) continue;
    const track = indexStore.getTrackById(trackId);
    if (!track) continue;
    scored.push(makeScored(track, entry.count));
  }
  return { scored, notes: [] };
}

/** Tracks the user hasn't played, from albums where they've played other tracks. */
function buildAlbumDeepCuts(
  playCounts: Record<string, PlayCountEntry>,
  indexStore: IndexStore
): { scored: ScoredTrack[]; notes: string[] } {
  // Aggregate plays by (artist, album).
  const albumKey = (artist: string, album: string): string =>
    `${(artist ?? "").toLowerCase()}::${(album ?? "").toLowerCase()}`;

  const playedTrackIds = new Set<string>();
  const albumEngagement = new Map<string, { artist: string; album: string; played: number }>();

  for (const [trackId, entry] of Object.entries(playCounts)) {
    if (entry.count <= 0) continue;
    playedTrackIds.add(trackId);
    const track = indexStore.getTrackById(trackId);
    if (!track) continue;
    const album = track.tags.album;
    const artist = track.tags.albumArtist ?? track.tags.artist;
    if (!album || !artist) continue;
    const key = albumKey(artist, album);
    const existing = albumEngagement.get(key);
    if (existing) {
      existing.played += entry.count;
    } else {
      albumEngagement.set(key, { artist, album, played: entry.count });
    }
  }

  const scored: ScoredTrack[] = [];
  for (const [, info] of albumEngagement) {
    if (info.played < DEEP_CUTS_MIN_ALBUM_ENGAGEMENT) continue;
    const albumTracks = indexStore.getTracksByAlbum(info.album);
    if (albumTracks.length < DEEP_CUTS_MIN_ALBUM_TRACKS) continue;
    for (const track of albumTracks) {
      if (playedTrackIds.has(track.id)) continue;
      // Match the album-artist when possible to avoid pulling tracks from
      // different artists that happen to share an album title.
      const trackArtist = (track.tags.albumArtist ?? track.tags.artist ?? "").toLowerCase();
      if (trackArtist !== info.artist.toLowerCase()) continue;
      // Weight: more-engaged albums rank higher.
      scored.push(makeScored(track, info.played));
    }
  }
  return { scored, notes: [] };
}

// ── Generation ─────────────────────────────────────────────────────

export type PersonalGenerationResult = {
  playlists: PersonalPlaylist[];
  trace: PersonalTrace;
};

function buildPlaylist(
  variant: PersonalVariantId,
  scored: ScoredTrack[],
  generatedAt: string
): PersonalPlaylist | null {
  if (scored.length < MIN_TRACKS_PER_PLAYLIST) return null;
  const tracks = sequenceWeighted(scored, TRACKS_PER_PLAYLIST);
  if (tracks.length < MIN_TRACKS_PER_PLAYLIST) return null;
  const labels = VARIANT_LABELS[variant];
  const gradient = VARIANT_GRADIENTS[variant];
  const mosaic = pickMosaicCovers(tracks);
  return {
    id: `personal:${variant}`,
    variant,
    name: labels.name,
    description: labels.description,
    trackIds: tracks.map((t) => t.id),
    trackCount: tracks.length,
    generatedAt,
    colors: gradient.colors,
    gradientAngle: gradient.angle,
    ...(mosaic.length > 0 ? { mosaicCovers: mosaic } : {})
  };
}

export async function generatePersonalPlaylistsWithTrace(
  userId: string,
  indexStore: IndexStore
): Promise<PersonalGenerationResult> {
  const builder = new PersonalTraceBuilder(userId);
  const playCounts = await getUserPlayCounts(userId);
  const recentSkips = await getRecentSkipCounts(userId, RECENT_SKIPS_WINDOW_DAYS);
  const heavySkippedTrackIds = new Set(
    Object.entries(recentSkips)
      .filter(([, e]) => e.count >= SKIP_HARD_FILTER_THRESHOLD)
      .map(([id]) => id)
  );
  const entries = Object.entries(playCounts);
  const totalPlays = entries.reduce((sum, [, e]) => sum + e.count, 0);

  const distinctArtists = new Set<string>();
  for (const [trackId] of entries) {
    const track = indexStore.getTrackById(trackId);
    if (track) {
      const a = (track.tags.artist ?? "").toLowerCase();
      if (a) distinctArtists.add(a);
    }
  }

  builder.setStats(totalPlays, distinctArtists.size);

  if (totalPlays < MIN_TOTAL_PLAYS || distinctArtists.size < MIN_DISTINCT_ARTISTS) {
    log.debug(`Personal: user ${userId} below thresholds, skipping`);
    return { playlists: [], trace: builder.build() };
  }

  const generatedAt = new Date().toISOString();
  const now = Date.now();
  const playlists: PersonalPlaylist[] = [];

  const variantBuilders: Array<{
    variant: PersonalVariantId;
    fn: () => { scored: ScoredTrack[]; notes: string[] };
  }> = [
    { variant: "discovered-this-year", fn: () => buildDiscoveredThisYear(playCounts, indexStore, now) },
    { variant: "forgotten-favorites", fn: () => buildForgottenFavorites(playCounts, indexStore, now) },
    { variant: "album-deep-cuts", fn: () => buildAlbumDeepCuts(playCounts, indexStore) }
  ];

  for (const { variant, fn } of variantBuilders) {
    const { scored: rawScored, notes } = fn();
    const scored = heavySkippedTrackIds.size > 0
      ? rawScored.filter((s) => !heavySkippedTrackIds.has(s.track.id))
      : rawScored;
    const playlist = buildPlaylist(variant, scored, generatedAt);

    const traceEntry: PersonalVariantTrace = {
      variant,
      playlistId: playlist?.id ?? null,
      candidatePoolSize: scored.length,
      finalTrackCount: playlist?.trackCount ?? 0,
      ...(playlist ? {} : { rejection: "below-min-tracks" }),
      ...(notes.length > 0 ? { notes } : {})
    };
    builder.recordVariant(traceEntry);

    if (playlist) playlists.push(playlist);
  }

  return { playlists, trace: builder.build() };
}

// ── Storage ────────────────────────────────────────────────────────

export async function savePersonalPlaylists(userId: string, playlists: PersonalPlaylist[]): Promise<void> {
  const dir = userPersonalDir(userId);
  await ensureDir(dir);

  const existing = await fs.readdir(dir).catch(() => []);
  for (const file of existing) {
    if (file.endsWith(".json") && file !== "_meta.json" && file !== "_trace.json") {
      await fs.unlink(path.join(dir, file)).catch(() => {});
    }
  }

  for (const playlist of playlists) {
    const fileName = `${playlist.variant}.json`;
    await writeJsonAtomic(path.join(dir, fileName), playlist);
  }

  const meta: PersonalMeta = { lastGeneratedAt: new Date().toISOString() };
  await writeJsonAtomic(userPersonalMetaPath(userId), meta);

  log.info(`Saved ${playlists.length} personal playlist(s) for user ${userId}`);
}

export async function loadPersonalPlaylists(userId: string): Promise<PersonalPlaylist[]> {
  const dir = userPersonalDir(userId);
  await ensureDir(dir);

  const files = await fs.readdir(dir).catch(() => []);
  const playlists: PersonalPlaylist[] = [];

  for (const file of files) {
    if (!file.endsWith(".json") || file === "_meta.json" || file === "_trace.json") continue;
    const data = await readJsonFile<PersonalPlaylist>(
      path.join(dir, file),
      null as unknown as PersonalPlaylist
    );
    if (data && data.id && data.trackIds) {
      playlists.push(data);
    }
  }

  // Stable order matching the in-code variant order, so the UI is consistent.
  const ORDER: Record<PersonalVariantId, number> = {
    "discovered-this-year": 0,
    "forgotten-favorites": 1,
    "album-deep-cuts": 2
  };
  return playlists.sort((a, b) => (ORDER[a.variant] ?? 99) - (ORDER[b.variant] ?? 99));
}

export async function getPersonalPlaylistById(
  userId: string,
  playlistId: string
): Promise<PersonalPlaylist | null> {
  const all = await loadPersonalPlaylists(userId);
  return all.find((p) => p.id === playlistId) ?? null;
}

export async function savePersonalTrace(userId: string, trace: PersonalTrace): Promise<void> {
  await ensureDir(userPersonalDir(userId));
  await writeJsonAtomic(userPersonalTracePath(userId), trace);
}

export async function loadPersonalTrace(userId: string): Promise<PersonalTrace | null> {
  const data = await readJsonFile<PersonalTrace>(
    userPersonalTracePath(userId),
    null as unknown as PersonalTrace
  );
  if (!data || typeof data !== "object" || !data.userId) return null;
  return data;
}

// ── Regeneration ───────────────────────────────────────────────────

export async function needsPersonalRegeneration(userId: string): Promise<boolean> {
  const meta = await readJsonFile<PersonalMeta>(userPersonalMetaPath(userId), { lastGeneratedAt: "" });
  if (!meta.lastGeneratedAt) return true;
  const lastGenerated = new Date(meta.lastGeneratedAt).getTime();
  if (isNaN(lastGenerated)) return true;
  return Date.now() - lastGenerated > REGENERATION_INTERVAL_MS;
}

export async function regeneratePersonalPlaylists(
  userId: string,
  indexStore: IndexStore
): Promise<PersonalPlaylist[]> {
  log.info(`Regenerating personal playlists for user ${userId}...`);
  const { playlists, trace } = await generatePersonalPlaylistsWithTrace(userId, indexStore);
  await savePersonalPlaylists(userId, playlists);
  await savePersonalTrace(userId, trace);

  const variantSummary = trace.variants
    .map((v) => `${v.variant}=${v.finalTrackCount}`)
    .join(",");
  log.info(
    `personal: user=${userId} variants=${variantSummary} ` +
      `playlists=${playlists.length} durationMs=${trace.durationMs}`
  );
  return playlists;
}

export async function checkAndRegeneratePersonalOnBoot(
  userId: string,
  indexStore: IndexStore
): Promise<void> {
  const shouldRegenerate = await needsPersonalRegeneration(userId);
  if (!shouldRegenerate) {
    const existing = await loadPersonalPlaylists(userId);
    log.debug(`Personal playlists up to date for user ${userId} (${existing.length} playlist(s))`);
    return;
  }
  await regeneratePersonalPlaylists(userId, indexStore);
}
