import fs from "node:fs/promises";
import path from "node:path";

import { createLogger } from "../../utils/logger";
import { dataRoot, usersStorageRoot } from "../../utils/paths";
import { ensureDir, readJsonFile, updateJsonFile, writeJsonAtomic } from "../../utils/fs";
import { normalizeGenreLabel } from "../genre/genreSynonymService";
import { getUserTopArtists, getUserPlayCounts } from "../activity/playCountStore";
import type { IndexStore } from "../indexer/indexStore";
import type { Track } from "../../types/library";
import { ForYouTraceBuilder, type ForYouTrace } from "./playlistTrace";

const log = createLogger("for-you-playlists");

const FOR_YOU_DIR = path.join(dataRoot, "auto-playlists", "for-you");
const REGENERATION_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000;

const MIN_TOTAL_PLAYS = 20;
const MIN_DISTINCT_ARTISTS = 3;
const MAX_TOP_ARTISTS = 3;
const TRACKS_PER_PLAYLIST = 25;
const SEED_ARTIST_RATIO = 0.4;

// ── Types ──────────────────────────────────────────────────────────

export type ForYouPlaylist = {
  id: string;
  name: string;
  seedArtist: string;
  trackIds: string[];
  trackCount: number;
  generatedAt: string;
};

type ForYouMeta = {
  lastGeneratedAt: string;
};

type DismissedEntry = {
  playlistId: string;
  dismissedAt: string;
};

type DismissedFile = {
  dismissed: DismissedEntry[];
};

// ── Paths ──────────────────────────────────────────────────────────

function userForYouDir(userId: string): string {
  return path.join(FOR_YOU_DIR, userId);
}

function userForYouMetaPath(userId: string): string {
  return path.join(userForYouDir(userId), "_meta.json");
}

function userForYouTracePath(userId: string): string {
  return path.join(userForYouDir(userId), "_trace.json");
}

function dismissedPath(userId: string): string {
  return path.join(usersStorageRoot, userId, "dismissed-playlists.json");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── Diversity selection (reused from auto playlist service) ───────

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

// ── Dismissal store ───────────────────────────────────────────────

const DISMISSAL_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 3 months

async function readDismissals(userId: string): Promise<DismissedEntry[]> {
  const data = await readJsonFile<DismissedFile>(dismissedPath(userId), { dismissed: [] });
  if (!data || !Array.isArray(data.dismissed)) return [];
  return data.dismissed;
}

function getActiveDismissals(entries: DismissedEntry[]): Set<string> {
  const now = Date.now();
  const active = new Set<string>();
  for (const entry of entries) {
    const dismissedAt = new Date(entry.dismissedAt).getTime();
    if (!isNaN(dismissedAt) && now - dismissedAt < DISMISSAL_EXPIRY_MS) {
      active.add(entry.playlistId);
    }
  }
  return active;
}

export async function dismissForYouPlaylist(userId: string, playlistId: string): Promise<void> {
  await updateJsonFile<DismissedFile>(
    dismissedPath(userId),
    { dismissed: [] },
    (current) => {
      const entries = Array.isArray(current?.dismissed) ? [...current.dismissed] : [];
      const existing = entries.find((e) => e.playlistId === playlistId);
      if (existing) {
        existing.dismissedAt = new Date().toISOString();
      } else {
        entries.push({ playlistId, dismissedAt: new Date().toISOString() });
      }
      return { dismissed: entries };
    }
  );
  log.info(`User ${userId} dismissed for-you playlist ${playlistId}`);
}

export async function getUserDismissals(userId: string): Promise<Set<string>> {
  const entries = await readDismissals(userId);
  return getActiveDismissals(entries);
}

// ── Playlist generation ───────────────────────────────────────────

function getArtistProfile(
  artist: string,
  indexStore: IndexStore
): { genres: string[]; minYear: number; maxYear: number } {
  const tracks = indexStore.getTracksByArtist(artist);
  const genres = new Set<string>();
  let minYear = Infinity;
  let maxYear = -Infinity;

  for (const track of tracks) {
    if (track.tags.genre) {
      for (const g of track.tags.genre) {
        genres.add(normalizeGenreLabel(g).toLowerCase());
      }
    }
    if (track.tags.year) {
      if (track.tags.year < minYear) minYear = track.tags.year;
      if (track.tags.year > maxYear) maxYear = track.tags.year;
    }
  }

  return {
    genres: Array.from(genres),
    minYear: minYear === Infinity ? 1970 : minYear,
    maxYear: maxYear === -Infinity ? 2026 : maxYear
  };
}

function findPeerTracks(
  seedArtist: string,
  profile: { genres: string[]; minYear: number; maxYear: number },
  allTracks: Track[]
): ScoredTrack[] {
  const yearLow = profile.minYear - 10;
  const yearHigh = profile.maxYear + 10;
  const genreSet = new Set(profile.genres);
  const seedArtistLower = seedArtist.toLowerCase();
  const peers: ScoredTrack[] = [];

  for (const track of allTracks) {
    const trackArtist = (track.tags.artist ?? "").toLowerCase();
    if (trackArtist === seedArtistLower) continue;

    const year = track.tags.year;
    if (year && (year < yearLow || year > yearHigh)) continue;

    const trackGenres = track.tags.genre;
    if (!trackGenres || trackGenres.length === 0) continue;

    const hasMatchingGenre = trackGenres.some(
      (g) => genreSet.has(normalizeGenreLabel(g).toLowerCase())
    );
    if (!hasMatchingGenre) continue;

    peers.push({
      track,
      artist: trackArtist,
      album: (track.tags.album ?? "").toLowerCase()
    });
  }

  return peers;
}

type BuildResult =
  | { playlist: ForYouPlaylist; trace: BuildTrace }
  | { playlist: null; trace: BuildTrace };

type BuildTrace = {
  profile: { genres: string[]; minYear: number; maxYear: number };
  candidatePoolSize: number;
  seedTrackCount: number;
  peerTrackCount: number;
  finalTrackIds: string[];
  rejection?: string;
};

function buildForYouPlaylist(
  seedArtist: string,
  indexStore: IndexStore,
  allTracks: Track[]
): BuildResult {
  const profile = getArtistProfile(seedArtist, indexStore);
  const baseTrace: BuildTrace = {
    profile,
    candidatePoolSize: 0,
    seedTrackCount: 0,
    peerTrackCount: 0,
    finalTrackIds: []
  };

  if (profile.genres.length === 0) {
    return { playlist: null, trace: { ...baseTrace, rejection: "no-genre-profile" } };
  }

  const seedTracks = indexStore.getTracksByArtist(seedArtist);
  const seedScored: ScoredTrack[] = seedTracks.map((t) => ({
    track: t,
    artist: (t.tags.artist ?? "").toLowerCase(),
    album: (t.tags.album ?? "").toLowerCase()
  }));

  const peerTracks = findPeerTracks(seedArtist, profile, allTracks);
  baseTrace.candidatePoolSize = peerTracks.length;
  baseTrace.seedTrackCount = seedScored.length;
  baseTrace.peerTrackCount = peerTracks.length;

  if (peerTracks.length < 3) {
    return { playlist: null, trace: { ...baseTrace, rejection: "too-few-peers" } };
  }

  const seedCount = Math.round(TRACKS_PER_PLAYLIST * SEED_ARTIST_RATIO);
  const peerCount = TRACKS_PER_PLAYLIST - seedCount;

  const selectedSeed = selectDiverseTracks(seedScored, seedCount);
  const selectedPeers = selectDiverseTracks(peerTracks, peerCount);

  const combined: ScoredTrack[] = [
    ...selectedSeed.map((t) => ({
      track: t,
      artist: (t.tags.artist ?? "").toLowerCase(),
      album: (t.tags.album ?? "").toLowerCase()
    })),
    ...selectedPeers.map((t) => ({
      track: t,
      artist: (t.tags.artist ?? "").toLowerCase(),
      album: (t.tags.album ?? "").toLowerCase()
    }))
  ];

  const finalTracks = selectDiverseTracks(combined, TRACKS_PER_PLAYLIST);
  baseTrace.finalTrackIds = finalTracks.map((t) => t.id);

  if (finalTracks.length < 5) {
    return { playlist: null, trace: { ...baseTrace, rejection: "too-few-final-tracks" } };
  }

  const id = `for-you:${slugify(seedArtist)}`;
  return {
    playlist: {
      id,
      name: `Because you listen to ${seedArtist}`,
      seedArtist,
      trackIds: finalTracks.map((t) => t.id),
      trackCount: finalTracks.length,
      generatedAt: new Date().toISOString()
    },
    trace: baseTrace
  };
}

export type GenerationResult = {
  playlists: ForYouPlaylist[];
  trace: ForYouTrace;
};

export async function generateForYouPlaylists(
  userId: string,
  indexStore: IndexStore
): Promise<ForYouPlaylist[]> {
  const result = await generateForYouPlaylistsWithTrace(userId, indexStore);
  return result.playlists;
}

export async function generateForYouPlaylistsWithTrace(
  userId: string,
  indexStore: IndexStore
): Promise<GenerationResult> {
  const builder = new ForYouTraceBuilder(userId);

  const playCounts = await getUserPlayCounts(userId);
  const entries = Object.entries(playCounts);
  const totalPlays = entries.reduce((sum, [, e]) => sum + e.count, 0);

  const topArtists = await getUserTopArtists(userId, MAX_TOP_ARTISTS + 5, indexStore);
  const distinctArtists = topArtists.length;
  builder.setStats(totalPlays, distinctArtists);

  for (const entry of topArtists) {
    builder.recordSeedCandidate({
      artist: entry.artist,
      score: entry.playCount,
      sources: ["top-artist"]
    });
  }

  if (totalPlays < MIN_TOTAL_PLAYS) {
    log.debug(`User ${userId} has only ${totalPlays} plays, skipping for-you generation`);
    builder.setSkipReason("below-min-plays");
    return { playlists: [], trace: builder.build() };
  }

  if (distinctArtists < MIN_DISTINCT_ARTISTS) {
    log.debug(`User ${userId} has only ${distinctArtists} distinct artists, skipping`);
    builder.setSkipReason("below-min-artists");
    return { playlists: [], trace: builder.build() };
  }

  const dismissals = await getUserDismissals(userId);
  const allTracks = indexStore.getSnapshot().tracks;
  const playlists: ForYouPlaylist[] = [];

  for (const entry of topArtists.slice(0, MAX_TOP_ARTISTS)) {
    const candidateId = `for-you:${slugify(entry.artist)}`;
    if (dismissals.has(candidateId)) {
      builder.recordSeedSkipped(entry.artist, "dismissed");
      continue;
    }

    const result = buildForYouPlaylist(entry.artist, indexStore, allTracks);

    if (result.playlist) {
      playlists.push(result.playlist);
      builder.recordSeedChosen(entry.artist);
      builder.recordPlaylist({
        seed: entry.artist,
        playlistId: result.playlist.id,
        profile: result.trace.profile,
        candidatePoolSize: result.trace.candidatePoolSize,
        seedTrackCount: result.trace.seedTrackCount,
        peerTrackCount: result.trace.peerTrackCount,
        finalTrackIds: result.trace.finalTrackIds
      });
    } else {
      builder.recordSeedSkipped(entry.artist, result.trace.rejection ?? "unknown");
      builder.recordPlaylist({
        seed: entry.artist,
        playlistId: null,
        profile: result.trace.profile,
        candidatePoolSize: result.trace.candidatePoolSize,
        seedTrackCount: result.trace.seedTrackCount,
        peerTrackCount: result.trace.peerTrackCount,
        finalTrackIds: result.trace.finalTrackIds,
        rejection: result.trace.rejection
      });
    }
  }

  return { playlists, trace: builder.build() };
}

// ── Storage ───────────────────────────────────────────────────────

export async function saveForYouPlaylists(userId: string, playlists: ForYouPlaylist[]): Promise<void> {
  const dir = userForYouDir(userId);
  await ensureDir(dir);

  const existing = await fs.readdir(dir).catch(() => []);
  for (const file of existing) {
    if (file.endsWith(".json") && file !== "_meta.json" && file !== "_trace.json") {
      await fs.unlink(path.join(dir, file)).catch(() => {});
    }
  }

  for (const playlist of playlists) {
    const fileName = `${slugify(playlist.seedArtist)}.json`;
    await writeJsonAtomic(path.join(dir, fileName), playlist);
  }

  const meta: ForYouMeta = { lastGeneratedAt: new Date().toISOString() };
  await writeJsonAtomic(userForYouMetaPath(userId), meta);

  log.info(`Saved ${playlists.length} for-you playlist(s) for user ${userId}`);
}

export async function loadForYouPlaylists(userId: string): Promise<ForYouPlaylist[]> {
  const dir = userForYouDir(userId);
  await ensureDir(dir);

  const files = await fs.readdir(dir).catch(() => []);
  const playlists: ForYouPlaylist[] = [];

  for (const file of files) {
    if (!file.endsWith(".json") || file === "_meta.json" || file === "_trace.json") continue;
    const data = await readJsonFile<ForYouPlaylist>(
      path.join(dir, file),
      null as unknown as ForYouPlaylist
    );
    if (data && data.id && data.trackIds) {
      playlists.push(data);
    }
  }

  return playlists.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getForYouPlaylistById(
  userId: string,
  playlistId: string
): Promise<ForYouPlaylist | null> {
  const all = await loadForYouPlaylists(userId);
  return all.find((p) => p.id === playlistId) ?? null;
}

// ── Regeneration ──────────────────────────────────────────────────

export async function needsForYouRegeneration(userId: string): Promise<boolean> {
  const metaPath = userForYouMetaPath(userId);
  const meta = await readJsonFile<ForYouMeta>(metaPath, { lastGeneratedAt: "" });
  if (!meta.lastGeneratedAt) return true;

  const lastGenerated = new Date(meta.lastGeneratedAt).getTime();
  if (isNaN(lastGenerated)) return true;

  return Date.now() - lastGenerated > REGENERATION_INTERVAL_MS;
}

export async function regenerateForYouPlaylists(
  userId: string,
  indexStore: IndexStore
): Promise<ForYouPlaylist[]> {
  log.info(`Regenerating for-you playlists for user ${userId}...`);
  const { playlists, trace } = await generateForYouPlaylistsWithTrace(userId, indexStore);
  await saveForYouPlaylists(userId, playlists);
  await saveForYouTrace(userId, trace);

  const totalCandidates = trace.playlists.reduce((sum, p) => sum + p.candidatePoolSize, 0);
  const seeds = trace.seedSelection.chosen.join(",") || "(none)";
  log.info(
    `for-you: user=${userId} seeds=${seeds} playlists=${playlists.length} ` +
      `totalCandidates=${totalCandidates} durationMs=${trace.durationMs}`
  );
  return playlists;
}

export async function saveForYouTrace(userId: string, trace: ForYouTrace): Promise<void> {
  await ensureDir(userForYouDir(userId));
  await writeJsonAtomic(userForYouTracePath(userId), trace);
}

export async function loadForYouTrace(userId: string): Promise<ForYouTrace | null> {
  const data = await readJsonFile<ForYouTrace>(userForYouTracePath(userId), null as unknown as ForYouTrace);
  if (!data || typeof data !== "object" || !data.userId) return null;
  return data;
}

export async function checkAndRegenerateForYouOnBoot(
  userId: string,
  indexStore: IndexStore
): Promise<void> {
  const shouldRegenerate = await needsForYouRegeneration(userId);
  if (!shouldRegenerate) {
    const existing = await loadForYouPlaylists(userId);
    log.debug(`For-you playlists up to date for user ${userId} (${existing.length} playlist(s))`);
    return;
  }

  await regenerateForYouPlaylists(userId, indexStore);
}
