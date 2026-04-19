import fs from "node:fs/promises";
import path from "node:path";

import { createLogger } from "../../utils/logger";
import { dataRoot, usersStorageRoot } from "../../utils/paths";
import { ensureDir, readJsonFile, updateJsonFile, writeJsonAtomic } from "../../utils/fs";
import { normalizeGenreLabel } from "../genre/genreSynonymService";
import { getUserTopArtists, getUserPlayCounts } from "../activity/playCountStore";
import type { IndexStore } from "../indexer/indexStore";
import type { Track } from "../../types/library";

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

function buildForYouPlaylist(
  seedArtist: string,
  indexStore: IndexStore,
  allTracks: Track[]
): ForYouPlaylist | null {
  const profile = getArtistProfile(seedArtist, indexStore);
  if (profile.genres.length === 0) return null;

  const seedTracks = indexStore.getTracksByArtist(seedArtist);
  const seedScored: ScoredTrack[] = seedTracks.map((t) => ({
    track: t,
    artist: (t.tags.artist ?? "").toLowerCase(),
    album: (t.tags.album ?? "").toLowerCase()
  }));

  const peerTracks = findPeerTracks(seedArtist, profile, allTracks);
  if (peerTracks.length < 3) return null;

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
  if (finalTracks.length < 5) return null;

  const id = `for-you:${slugify(seedArtist)}`;
  return {
    id,
    name: `Because you listen to ${seedArtist}`,
    seedArtist,
    trackIds: finalTracks.map((t) => t.id),
    trackCount: finalTracks.length,
    generatedAt: new Date().toISOString()
  };
}

export async function generateForYouPlaylists(
  userId: string,
  indexStore: IndexStore
): Promise<ForYouPlaylist[]> {
  const playCounts = await getUserPlayCounts(userId);
  const entries = Object.entries(playCounts);
  const totalPlays = entries.reduce((sum, [, e]) => sum + e.count, 0);

  if (totalPlays < MIN_TOTAL_PLAYS) {
    log.debug(`User ${userId} has only ${totalPlays} plays, skipping for-you generation`);
    return [];
  }

  const topArtists = await getUserTopArtists(userId, MAX_TOP_ARTISTS + 5, indexStore);
  const distinctArtists = topArtists.length;

  if (distinctArtists < MIN_DISTINCT_ARTISTS) {
    log.debug(`User ${userId} has only ${distinctArtists} distinct artists, skipping`);
    return [];
  }

  const dismissals = await getUserDismissals(userId);
  const allTracks = indexStore.getSnapshot().tracks;
  const playlists: ForYouPlaylist[] = [];

  for (const entry of topArtists.slice(0, MAX_TOP_ARTISTS)) {
    const candidateId = `for-you:${slugify(entry.artist)}`;
    if (dismissals.has(candidateId)) continue;

    const playlist = buildForYouPlaylist(entry.artist, indexStore, allTracks);
    if (playlist) {
      playlists.push(playlist);
    }
  }

  return playlists;
}

// ── Storage ───────────────────────────────────────────────────────

export async function saveForYouPlaylists(userId: string, playlists: ForYouPlaylist[]): Promise<void> {
  const dir = userForYouDir(userId);
  await ensureDir(dir);

  const existing = await fs.readdir(dir).catch(() => []);
  for (const file of existing) {
    if (file.endsWith(".json") && file !== "_meta.json") {
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
    if (!file.endsWith(".json") || file === "_meta.json") continue;
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
  const playlists = await generateForYouPlaylists(userId, indexStore);
  await saveForYouPlaylists(userId, playlists);
  log.info(`Generated ${playlists.length} for-you playlist(s) for user ${userId}`);
  return playlists;
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
