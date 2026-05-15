import { createLogger } from "../../../utils/logger";
import { normalizeGenreLabel } from "../../genre/genreSynonymService";
import { getUserPlayCounts } from "../../activity/playCountStore";
import { getRecentSkipCounts } from "../../activity/skipStore";
import { loadEmbedding } from "../../embeddings/audioEmbeddingService";
import {
  cosineSimilarity,
  meanVector,
  EMBEDDING_DIM,
  EMBEDDING_VERSION
} from "../../embeddings/audioFeatures";
import type { IndexStore } from "../../indexer/indexStore";
import type { Track } from "../../../types/library";
import { ForYouTraceBuilder, type ForYouTrace, type ScoredTrackTrace } from "../playlistTrace";
import {
  fnvJitter,
  genreJaccard,
  logPopularity,
  noveltyScore,
  scoreFeatures,
  yearProximity,
  DEFAULT_WEIGHTS,
  NEUTRAL_EMBEDDING_SIMILARITY,
  SKIP_HARD_FILTER_THRESHOLD,
  type CandidateFeatures
} from "../forYouRanker";
import { getUserDismissals } from "./dismissals";
import { slugify } from "./paths";
import type { ForYouPlaylist } from "./store";

const log = createLogger("for-you-playlists");

const MIN_TOTAL_PLAYS = 20;
const MIN_DISTINCT_ARTISTS = 3;
const MAX_SEEDS = 6;
const TRACKS_PER_PLAYLIST = 25;
const MAX_PER_PEER_ARTIST = 4;
const MAX_PER_ALBUM = 2;
const TOP_REJECTIONS_RECORDED = 5;

const RECENT_PLAYS_WINDOW_DAYS = 30;
const ALBUM_DEPTH_WINDOW_DAYS = 60;
const ALBUM_DEPTH_THRESHOLD = 0.7;
const RECENT_SKIPS_WINDOW_DAYS = 60;

// Candidate-pool fallbacks (broaden the pool beyond strict genre+year match).
// Phase 4 (2026-05) loosened both: CLAP cosine in the ranker now decides
// "actually similar?", so the pre-rank filters can be coarse safety rails.
const GENRE_JACCARD_FLOOR = 0.1;
const YEAR_FALLBACK_WINDOW = 12;

// ── Aggregate signals ─────────────────────────────────────────────

type PlayCountEntry = { count: number; lastPlayedAt: string };

type SignalMaps = {
  artistLifetimePlays: Map<string, number>;
  artistRecentPlays: Map<string, number>;
  trackRecentPlays: Map<string, number>;
  trackRecentSkips: Map<string, number>;
  maxArtistLifetimePlays: number;
  albumDepthArtists: Map<string, number>; // artist (lowercase) → score contribution from album-deep
};

function computeSignals(
  playCounts: Record<string, PlayCountEntry>,
  recentSkipCounts: Record<string, { count: number }>,
  indexStore: IndexStore
): SignalMaps {
  const now = Date.now();
  const recentCutoff = now - RECENT_PLAYS_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const albumDepthCutoff = now - ALBUM_DEPTH_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const artistLifetimePlays = new Map<string, number>();
  const artistRecentPlays = new Map<string, number>();
  const trackRecentPlays = new Map<string, number>();
  const albumPlaysInWindow = new Map<string, { artist: string; album: string; count: number }>();

  for (const [trackId, entry] of Object.entries(playCounts)) {
    const track = indexStore.getTrackById(trackId);
    if (!track) continue;

    const artistKey = (track.tags.artist ?? "").toLowerCase();
    artistLifetimePlays.set(artistKey, (artistLifetimePlays.get(artistKey) ?? 0) + entry.count);

    const playedAt = new Date(entry.lastPlayedAt).getTime();
    if (!isNaN(playedAt) && playedAt >= recentCutoff) {
      artistRecentPlays.set(artistKey, (artistRecentPlays.get(artistKey) ?? 0) + entry.count);
      trackRecentPlays.set(trackId, entry.count);
    }

    const album = (track.tags.album ?? "").toLowerCase();
    if (album && !isNaN(playedAt) && playedAt >= albumDepthCutoff) {
      const albumKey = `${artistKey}::${album}`;
      const existing = albumPlaysInWindow.get(albumKey);
      if (existing) {
        existing.count += 1;
      } else {
        albumPlaysInWindow.set(albumKey, {
          artist: track.tags.artist ?? "",
          album: track.tags.album ?? "",
          count: 1
        });
      }
    }
  }

  let maxArtistLifetimePlays = 0;
  for (const v of artistLifetimePlays.values()) {
    if (v > maxArtistLifetimePlays) maxArtistLifetimePlays = v;
  }

  // Album-deep: artists where ≥ ALBUM_DEPTH_THRESHOLD of an album's tracks were
  // played in the depth window. Skip tiny albums (≤3 tracks) where the threshold
  // is trivially met.
  const albumDepthArtists = new Map<string, number>();
  for (const [, info] of albumPlaysInWindow) {
    const albumTracks = indexStore.getTracksByAlbum(info.album);
    if (albumTracks.length < 4) continue;
    const ratio = info.count / albumTracks.length;
    if (ratio < ALBUM_DEPTH_THRESHOLD) continue;
    const artistKey = info.artist.toLowerCase();
    if (!artistKey) continue;
    const contribution = 0.4 * albumTracks.length;
    albumDepthArtists.set(artistKey, (albumDepthArtists.get(artistKey) ?? 0) + contribution);
  }

  const trackRecentSkips = new Map<string, number>();
  for (const [trackId, entry] of Object.entries(recentSkipCounts)) {
    trackRecentSkips.set(trackId, entry.count);
  }

  return {
    artistLifetimePlays,
    artistRecentPlays,
    trackRecentPlays,
    trackRecentSkips,
    maxArtistLifetimePlays,
    albumDepthArtists
  };
}

// ── Seed selection ────────────────────────────────────────────────

type SeedCandidate = {
  artist: string;
  score: number;
  sources: string[];
};

/**
 * Pick up to MAX_SEEDS distinct artists, drawn from three sources: lifetime
 * top artists, rediscovered artists (high recency, not in lifetime top 5),
 * and artists qualifying via album-deep listening.
 */
function selectSeeds(signals: SignalMaps, indexStore: IndexStore): SeedCandidate[] {
  const byArtist = new Map<string, SeedCandidate>();

  // Resolve canonical artist label (case-preserving) from any track for that key.
  function canonicalArtist(artistKey: string): string {
    if (!artistKey) return "";
    const tracks = indexStore.getTracksByArtist(artistKey);
    return tracks[0]?.tags.artist ?? artistKey;
  }

  // Source 1: top artists by lifetime plays.
  const lifetimeRanked = [...signals.artistLifetimePlays.entries()]
    .filter(([k]) => k !== "")
    .sort((a, b) => b[1] - a[1]);

  for (const [artistKey, plays] of lifetimeRanked.slice(0, 8)) {
    const score = Math.log(1 + plays);
    const entry = byArtist.get(artistKey);
    if (entry) {
      entry.score += score;
      entry.sources.push("top-artist");
    } else {
      byArtist.set(artistKey, { artist: canonicalArtist(artistKey), score, sources: ["top-artist"] });
    }
  }

  // Source 2: rediscovered — recently played but not in lifetime top 5.
  const lifetimeTop5 = new Set(lifetimeRanked.slice(0, 5).map(([k]) => k));
  for (const [artistKey, recent] of signals.artistRecentPlays) {
    if (recent < 3) continue;
    if (lifetimeTop5.has(artistKey)) continue;
    if (!artistKey) continue;
    const score = 0.5 * recent;
    const entry = byArtist.get(artistKey);
    if (entry) {
      entry.score += score;
      entry.sources.push("rediscovered");
    } else {
      byArtist.set(artistKey, { artist: canonicalArtist(artistKey), score, sources: ["rediscovered"] });
    }
  }

  // Source 3: album-deep — heavy listening of a specific album in the window.
  for (const [artistKey, contribution] of signals.albumDepthArtists) {
    if (!artistKey) continue;
    const entry = byArtist.get(artistKey);
    if (entry) {
      entry.score += contribution;
      entry.sources.push("album-deep");
    } else {
      byArtist.set(artistKey, { artist: canonicalArtist(artistKey), score: contribution, sources: ["album-deep"] });
    }
  }

  return [...byArtist.values()].sort((a, b) => b.score - a.score);
}

// ── Candidate gathering ───────────────────────────────────────────

type Candidate = {
  track: Track;
  artist: string;
  album: string;
  source: "genre" | "album-artist" | "label" | "year-fallback";
};

/**
 * Composite "<artist>::<album>" key used everywhere we deduplicate or cap on
 * album. Keying on album name alone collides across artists ("Greatest Hits",
 * self-titled debuts, etc.).
 */
function albumKey(artist: string | undefined, album: string | undefined): string {
  const b = (album ?? "").toLowerCase().trim();
  if (!b) return "";
  const a = (artist ?? "").toLowerCase().trim();
  return `${a}::${b}`;
}

function buildSeedAlbumKeys(seedTracks: Track[]): Set<string> {
  const set = new Set<string>();
  for (const t of seedTracks) {
    const key = albumKey(t.tags.artist, t.tags.album);
    if (key) set.add(key);
  }
  return set;
}

function buildSeedLabels(seedTracks: Track[]): Set<string> {
  const set = new Set<string>();
  for (const t of seedTracks) {
    if (!t.tags.label) continue;
    for (const l of t.tags.label) {
      const lower = l.toLowerCase().trim();
      if (lower) set.add(lower);
    }
  }
  return set;
}

function buildSeedAlbumArtists(seedTracks: Track[]): Set<string> {
  const set = new Set<string>();
  for (const t of seedTracks) {
    const aa = (t.tags.albumArtist ?? "").toLowerCase();
    if (aa) set.add(aa);
  }
  return set;
}

function gatherCandidates(
  seedArtist: string,
  profile: { genres: string[]; minYear: number; maxYear: number },
  seedTracks: Track[],
  allTracks: Track[],
  trackRecentSkips: ReadonlyMap<string, number>
): Candidate[] {
  const seedArtistLower = seedArtist.toLowerCase();
  const seedGenres = new Set(profile.genres);
  const seedLabels = buildSeedLabels(seedTracks);
  const seedAlbumArtists = buildSeedAlbumArtists(seedTracks);
  seedAlbumArtists.add(seedArtistLower);
  const midYear = (profile.minYear + profile.maxYear) / 2;
  const yearLow = midYear - YEAR_FALLBACK_WINDOW;
  const yearHigh = midYear + YEAR_FALLBACK_WINDOW;

  const candidates = new Map<string, Candidate>();

  for (const track of allTracks) {
    const trackArtist = (track.tags.artist ?? "").toLowerCase();
    if (!trackArtist || trackArtist === seedArtistLower) continue;

    if ((trackRecentSkips.get(track.id) ?? 0) >= SKIP_HARD_FILTER_THRESHOLD) continue;

    let source: Candidate["source"] | null = null;

    const trackGenres = track.tags.genre ?? [];
    if (trackGenres.length > 0 && genreJaccard(trackGenres, seedGenres) >= GENRE_JACCARD_FLOOR) {
      source = "genre";
    }

    if (!source) {
      const trackAlbumArtist = (track.tags.albumArtist ?? "").toLowerCase();
      if (trackAlbumArtist && seedAlbumArtists.has(trackAlbumArtist)) {
        source = "album-artist";
      }
    }

    if (!source && seedLabels.size > 0 && track.tags.label) {
      for (const l of track.tags.label) {
        if (seedLabels.has(l.toLowerCase().trim())) {
          source = "label";
          break;
        }
      }
    }

    if (!source) {
      const year = track.tags.year;
      if (year && year >= yearLow && year <= yearHigh) {
        source = "year-fallback";
      }
    }

    if (!source) continue;

    if (!candidates.has(track.id)) {
      candidates.set(track.id, {
        track,
        artist: trackArtist,
        album: albumKey(track.tags.artist, track.tags.album),
        source
      });
    }
  }

  return [...candidates.values()];
}

// ── Scoring + selection ───────────────────────────────────────────

type RankedCandidate = Candidate & {
  features: CandidateFeatures;
  rawScore: number;
  score: number;
};

function computeFeatures(
  candidate: Candidate,
  seedGenres: ReadonlySet<string>,
  midYear: number,
  seedAlbumKeys: ReadonlySet<string>,
  signals: SignalMaps,
  similarityByTrackId: ReadonlyMap<string, number>
): CandidateFeatures {
  const lifetimePlays = signals.artistLifetimePlays.get(candidate.artist) ?? 0;
  const recentPlays = signals.trackRecentPlays.get(candidate.track.id) ?? 0;

  return {
    genreOverlap: genreJaccard(candidate.track.tags.genre ?? [], seedGenres),
    yearProximity: yearProximity(candidate.track.tags.year, midYear),
    libraryPopularity: logPopularity(lifetimePlays, signals.maxArtistLifetimePlays),
    novelty: noveltyScore(recentPlays),
    albumOverlapWithSeed: candidate.album && seedAlbumKeys.has(candidate.album) ? 1 : 0,
    recentSkipCount: signals.trackRecentSkips.get(candidate.track.id) ?? 0,
    embeddingSimilarity:
      similarityByTrackId.get(candidate.track.id) ?? NEUTRAL_EMBEDDING_SIMILARITY
  };
}

function rankCandidates(
  candidates: Candidate[],
  userId: string,
  seedKey: string,
  seedGenres: ReadonlySet<string>,
  midYear: number,
  seedAlbumKeys: ReadonlySet<string>,
  signals: SignalMaps,
  similarityByTrackId: ReadonlyMap<string, number>
): RankedCandidate[] {
  return candidates
    .map((c) => {
      const features = computeFeatures(c, seedGenres, midYear, seedAlbumKeys, signals, similarityByTrackId);
      const rawScore = scoreFeatures(features);
      const jitter = fnvJitter(`${userId}|${seedKey}|${c.track.id}`);
      return { ...c, features, rawScore, score: rawScore + jitter };
    })
    .sort((a, b) => b.score - a.score);
}

const EMBEDDING_LOAD_CONCURRENCY = 16;

async function loadEmbeddingVectors(trackIds: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  // Cap concurrent reads. With unbounded Promise.all over 1000+ candidates we
  // were briefly opening that many file descriptors at once.
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < EMBEDDING_LOAD_CONCURRENCY; w++) {
    workers.push((async () => {
      while (true) {
        const i = cursor++;
        if (i >= trackIds.length) return;
        const id = trackIds[i]!;
        const e = await loadEmbedding(id);
        if (e) out.set(id, e.vec);
      }
    })());
  }
  await Promise.all(workers);
  return out;
}

/**
 * Greedy pick from a score-sorted list, enforcing per-artist and per-album
 * caps across the whole playlist (not just the local window). Returns the
 * picked items in score order; sequencing is handled separately.
 */
function pickWithCaps(
  ranked: RankedCandidate[],
  maxTracks: number,
  perArtist: number,
  perAlbum: number
): { picked: RankedCandidate[]; passedOver: RankedCandidate[] } {
  const picked: RankedCandidate[] = [];
  const passedOver: RankedCandidate[] = [];
  const artistCounts = new Map<string, number>();
  const albumCounts = new Map<string, number>();

  for (const c of ranked) {
    if (picked.length >= maxTracks) {
      passedOver.push(c);
      continue;
    }
    const artistCount = artistCounts.get(c.artist) ?? 0;
    const albumCount = c.album ? albumCounts.get(c.album) ?? 0 : 0;
    if (artistCount >= perArtist) {
      passedOver.push(c);
      continue;
    }
    if (c.album && albumCount >= perAlbum) {
      passedOver.push(c);
      continue;
    }
    picked.push(c);
    artistCounts.set(c.artist, artistCount + 1);
    if (c.album) albumCounts.set(c.album, albumCount + 1);
  }

  return { picked, passedOver };
}

/**
 * Sequence ordering pass. Preserves the chosen set; only swaps neighbors that
 * share an album to spread albums apart. No randomness — deterministic given
 * input order.
 */
function sequenceTracks(picked: RankedCandidate[]): RankedCandidate[] {
  const result = [...picked];
  for (let i = 1; i < result.length; i++) {
    if (result[i]!.album && result[i]!.album === result[i - 1]!.album) {
      // Find the next track with a different album to swap with.
      for (let j = i + 1; j < result.length; j++) {
        if (result[j]!.album !== result[i - 1]!.album) {
          [result[i], result[j]] = [result[j]!, result[i]!];
          break;
        }
      }
    }
  }
  return result;
}

// ── Familiarity-driven seed/peer ratio ───────────────────────────

function targetSeedShare(familiarity: number): number {
  // High familiarity (well-known artist) → fewer seed tracks, more peers.
  // Low familiarity → more seed tracks (user wants to hear the artist they liked).
  const clamped = Math.max(0, Math.min(1, familiarity));
  return 0.5 - 0.25 * clamped;
}

// ── Naming heuristic ─────────────────────────────────────────────

function namePlaylist(
  seedArtist: string,
  distinctPeerArtists: number,
  peerShare: number,
  dominantDecade: number | null
): string {
  if (peerShare < 0.3) return `More ${seedArtist}`;
  if (distinctPeerArtists <= 3) return `${seedArtist} & friends`;
  if (dominantDecade !== null) {
    const decadeLabel = `${dominantDecade % 100 === 0 ? dominantDecade : dominantDecade % 100}s`;
    return `${decadeLabel} with ${seedArtist}`;
  }
  if (peerShare > 0.7) return `Around ${seedArtist}`;
  return `Because you listen to ${seedArtist}`;
}

function dominantDecade(tracks: Track[]): number | null {
  const counts = new Map<number, number>();
  for (const t of tracks) {
    if (!t.tags.year) continue;
    const decade = Math.floor(t.tags.year / 10) * 10;
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  let best: { decade: number; count: number } | null = null;
  let total = 0;
  for (const [decade, count] of counts) {
    total += count;
    if (!best || count > best.count) best = { decade, count };
  }
  return best && best.count / total >= 0.6 ? best.decade : null;
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

type BuildTrace = {
  profile: { genres: string[]; minYear: number; maxYear: number };
  candidatePoolSize: number;
  seedTrackCount: number;
  peerTrackCount: number;
  finalTrackIds: string[];
  finalOrder: ScoredTrackTrace[];
  topRejections: ScoredTrackTrace[];
  playlistName?: string;
  rejection?: string;
};

type BuildResult =
  | { playlist: ForYouPlaylist; trace: BuildTrace }
  | { playlist: null; trace: BuildTrace };

async function buildForYouPlaylist(
  seedArtist: string,
  seedScore: number,
  indexStore: IndexStore,
  allTracks: Track[],
  signals: SignalMaps,
  userId: string
): Promise<BuildResult> {
  const profile = getArtistProfile(seedArtist, indexStore);
  const baseTrace: BuildTrace = {
    profile,
    candidatePoolSize: 0,
    seedTrackCount: 0,
    peerTrackCount: 0,
    finalTrackIds: [],
    finalOrder: [],
    topRejections: []
  };

  if (profile.genres.length === 0) {
    return { playlist: null, trace: { ...baseTrace, rejection: "no-genre-profile" } };
  }

  const seedTracks = indexStore.getTracksByArtist(seedArtist);
  baseTrace.seedTrackCount = seedTracks.length;
  const seedAlbumKeys = buildSeedAlbumKeys(seedTracks);
  const seedGenres = new Set(profile.genres);
  const midYear = (profile.minYear + profile.maxYear) / 2;

  const candidates = gatherCandidates(seedArtist, profile, seedTracks, allTracks, signals.trackRecentSkips);
  baseTrace.candidatePoolSize = candidates.length;
  baseTrace.peerTrackCount = candidates.length;

  if (candidates.length < 3) {
    return { playlist: null, trace: { ...baseTrace, rejection: "too-few-peers" } };
  }

  const seedKey = seedArtist.toLowerCase();

  // Embedding similarity: load seed-track embeddings once, then candidate
  // embeddings in parallel; precompute a trackId → cosine map so the rest
  // of the ranker stays sync.
  const seedEmbeddings = await loadEmbeddingVectors(seedTracks.map((t) => t.id));
  const seedMean =
    seedEmbeddings.size > 0 ? meanVector([...seedEmbeddings.values()]) : null;
  const candidateEmbeddings = await loadEmbeddingVectors(candidates.map((c) => c.track.id));
  const similarityByTrackId = new Map<string, number>();
  if (seedMean) {
    for (const [trackId, vec] of candidateEmbeddings) {
      similarityByTrackId.set(trackId, cosineSimilarity(seedMean, vec));
    }
  }

  const ranked = rankCandidates(
    candidates,
    userId,
    seedKey,
    seedGenres,
    midYear,
    seedAlbumKeys,
    signals,
    similarityByTrackId
  );

  const lifetimePlays = signals.artistLifetimePlays.get(seedKey) ?? 0;
  const familiarity = signals.maxArtistLifetimePlays > 0
    ? lifetimePlays / signals.maxArtistLifetimePlays
    : 0;
  const seedShare = targetSeedShare(familiarity);
  const seedQuota = Math.min(seedTracks.length, Math.round(TRACKS_PER_PLAYLIST * seedShare));
  const peerQuota = Math.max(0, TRACKS_PER_PLAYLIST - seedQuota);

  // Seed tracks: pick by lifetime play count first (favorites), fall back to insertion order.
  const seedRanked: RankedCandidate[] = seedTracks
    .filter((t) => (signals.trackRecentSkips.get(t.id) ?? 0) < SKIP_HARD_FILTER_THRESHOLD)
    .map((t) => {
      const trackPlays = signals.trackRecentPlays.get(t.id) ?? 0;
      const features: CandidateFeatures = {
        genreOverlap: 1,
        yearProximity: 1,
        libraryPopularity: logPopularity(lifetimePlays, signals.maxArtistLifetimePlays),
        novelty: noveltyScore(trackPlays),
        albumOverlapWithSeed: 1,
        recentSkipCount: signals.trackRecentSkips.get(t.id) ?? 0,
        embeddingSimilarity: 1
      };
      const rawScore = scoreFeatures(features);
      return {
        track: t,
        artist: seedKey,
        album: albumKey(t.tags.artist, t.tags.album),
        source: "genre" as const,
        features,
        rawScore,
        score: rawScore + fnvJitter(`${userId}|${seedKey}|seed|${t.id}`)
      };
    })
    .sort((a, b) => b.score - a.score);

  const seedPick = pickWithCaps(seedRanked, seedQuota, seedQuota, MAX_PER_ALBUM);
  const peerPick = pickWithCaps(ranked, peerQuota, MAX_PER_PEER_ARTIST, MAX_PER_ALBUM);

  const combined = [...seedPick.picked, ...peerPick.picked];
  if (combined.length < 5) {
    baseTrace.finalTrackIds = combined.map((c) => c.track.id);
    return { playlist: null, trace: { ...baseTrace, rejection: "too-few-final-tracks" } };
  }

  const sequenced = sequenceTracks(combined);
  baseTrace.finalTrackIds = sequenced.map((c) => c.track.id);
  baseTrace.finalOrder = sequenced.map((c) => ({
    trackId: c.track.id,
    artist: c.track.tags.artist ?? "",
    score: c.score,
    features: c.features,
    source: c.source
  }));
  baseTrace.topRejections = peerPick.passedOver.slice(0, TOP_REJECTIONS_RECORDED).map((c) => ({
    trackId: c.track.id,
    artist: c.track.tags.artist ?? "",
    score: c.score,
    features: c.features,
    source: c.source,
    rejection: "cap-or-overflow"
  }));

  const distinctPeerArtists = new Set(peerPick.picked.map((c) => c.artist)).size;
  const peerShare = combined.length > 0 ? peerPick.picked.length / combined.length : 0;
  const decade = dominantDecade(sequenced.map((c) => c.track));
  const name = namePlaylist(seedArtist, distinctPeerArtists, peerShare, decade);
  baseTrace.playlistName = name;

  const id = `for-you:${slugify(seedArtist)}`;
  return {
    playlist: {
      id,
      name,
      seedArtist,
      trackIds: sequenced.map((c) => c.track.id),
      trackCount: sequenced.length,
      generatedAt: new Date().toISOString(),
      score: seedScore
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
  builder.setRanker({
    weights: DEFAULT_WEIGHTS,
    embeddingDim: EMBEDDING_DIM,
    embeddingVersion: EMBEDDING_VERSION,
    candidateFilters: {
      genreJaccardFloor: GENRE_JACCARD_FLOOR,
      yearFallbackWindow: YEAR_FALLBACK_WINDOW
    }
  });

  const playCounts = await getUserPlayCounts(userId);
  const recentSkips = await getRecentSkipCounts(userId, RECENT_SKIPS_WINDOW_DAYS);
  const entries = Object.entries(playCounts);
  const totalPlays = entries.reduce((sum, [, e]) => sum + e.count, 0);

  const signals = computeSignals(playCounts, recentSkips, indexStore);
  const distinctArtists = signals.artistLifetimePlays.size;
  builder.setStats(totalPlays, distinctArtists);

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

  const seedCandidates = selectSeeds(signals, indexStore);
  for (const candidate of seedCandidates) {
    builder.recordSeedCandidate({
      artist: candidate.artist,
      score: candidate.score,
      sources: candidate.sources
    });
  }

  const dismissals = await getUserDismissals(userId);
  const allTracks = indexStore.getSnapshot().tracks;
  const playlists: ForYouPlaylist[] = [];
  let attemptedSeeds = 0;

  for (const candidate of seedCandidates) {
    if (attemptedSeeds >= MAX_SEEDS) break;
    const candidatePlaylistId = `for-you:${slugify(candidate.artist)}`;
    if (dismissals.has(candidatePlaylistId)) {
      builder.recordSeedSkipped(candidate.artist, "dismissed");
      continue;
    }
    attemptedSeeds++;

    const result = await buildForYouPlaylist(candidate.artist, candidate.score, indexStore, allTracks, signals, userId);

    if (result.playlist) {
      playlists.push(result.playlist);
      builder.recordSeedChosen(candidate.artist);
      builder.recordPlaylist({
        seed: candidate.artist,
        playlistId: result.playlist.id,
        playlistName: result.trace.playlistName,
        profile: result.trace.profile,
        candidatePoolSize: result.trace.candidatePoolSize,
        seedTrackCount: result.trace.seedTrackCount,
        peerTrackCount: result.trace.peerTrackCount,
        finalTrackIds: result.trace.finalTrackIds,
        finalOrder: result.trace.finalOrder,
        topRejections: result.trace.topRejections
      });
    } else {
      builder.recordSeedSkipped(candidate.artist, result.trace.rejection ?? "unknown");
      builder.recordPlaylist({
        seed: candidate.artist,
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
