/**
 * Diagnostic traces for auto-generated playlists. Phase 0 of the playlist
 * algorithm work: persist a structured record of every regeneration so we
 * can tune subsequent phases against real data instead of guessing.
 *
 * Traces are written next to the playlist JSON files (`_trace.json`). They
 * replace the previous trace on each regeneration; we only keep the latest.
 */

export type SeedCandidateTrace = {
  artist: string;
  score: number;
  sources: string[];
};

export type SeedSkippedTrace = {
  artist: string;
  reason: string;
};

export type ScoredTrackTrace = {
  trackId: string;
  artist: string;
  score: number;
  features: {
    genreOverlap: number;
    yearProximity: number;
    libraryPopularity: number;
    novelty: number;
    albumOverlapWithSeed: number;
    recentSkipCount: number;
    embeddingSimilarity: number;
  };
  source?: string;
  rejection?: string;
};

export type ForYouPlaylistTrace = {
  seed: string;
  playlistId: string | null;
  playlistName?: string;
  profile: {
    genres: string[];
    minYear: number;
    maxYear: number;
  };
  candidatePoolSize: number;
  seedTrackCount: number;
  peerTrackCount: number;
  finalTrackIds: string[];
  finalOrder?: ScoredTrackTrace[];
  topRejections?: ScoredTrackTrace[];
  rejection?: string;
};

/**
 * Snapshot of the ranker configuration used for this regeneration. Captured
 * so traces stay interpretable after weight tweaks — a few months later you
 * can still tell "did this pick happen under the embedding-heavy weights
 * or the older genre-heavy ones?". Optional on older trace files written
 * before this field existed.
 */
export type RankerSnapshot = {
  weights: {
    genreOverlap: number;
    yearProximity: number;
    libraryPopularity: number;
    novelty: number;
    albumOverlapWithSeed: number;
    skipPenalty: number;
    embeddingSimilarity: number;
  };
  embeddingDim: number;
  embeddingVersion: number;
  /** e.g. GENRE_JACCARD_FLOOR, YEAR_FALLBACK_WINDOW — the pre-rank filters. */
  candidateFilters?: Record<string, number>;
  /**
   * Knobs governing playlist-level diversity (cross-playlist reuse penalty,
   * per-album / per-artist caps, total tracks per playlist). Captured so a
   * future reader can tell whether a regenerated playlist's shape is
   * explained by the *limits* in force at the time or by the candidate pool.
   */
  diversityKnobs?: Record<string, number>;
};

export type ForYouTrace = {
  generatedAt: string;
  userId: string;
  durationMs: number;
  totalPlays: number;
  distinctArtists: number;
  skipReason?: "below-min-plays" | "below-min-artists";
  ranker?: RankerSnapshot;
  seedSelection: {
    candidates: SeedCandidateTrace[];
    chosen: string[];
    skipped: SeedSkippedTrace[];
  };
  playlists: ForYouPlaylistTrace[];
};

export type AutoPlaylistGroupTrace = {
  key: string;
  axis: "decade-genre" | "genre-tempo";
  genre: string;
  /** 0 for genre-tempo axis groups. */
  decade: number;
  tempo?: "slow" | "mid" | "driving" | "fast";
  trackCount: number;
  selected: boolean;
  mosaicCoverCount?: number;
  rejection?: string;
};

export type AutoTrace = {
  generatedAt: string;
  durationMs: number;
  totalCandidateTracks: number;
  totalGroups: number;
  qualifyingGroups: number;
  generatedPlaylists: number;
  groups: AutoPlaylistGroupTrace[];
};

/**
 * Mutable accumulator passed through the For You pipeline. Centralizes
 * the trace shape so callers don't need to know the JSON layout; they just
 * call the recording methods at the right point in the pipeline.
 */
export class ForYouTraceBuilder {
  private readonly startedAt = Date.now();
  private readonly userId: string;
  private totalPlays = 0;
  private distinctArtists = 0;
  private skipReason: ForYouTrace["skipReason"];
  private readonly candidates: SeedCandidateTrace[] = [];
  private readonly chosen: string[] = [];
  private readonly skipped: SeedSkippedTrace[] = [];
  private readonly playlists: ForYouPlaylistTrace[] = [];
  private ranker: RankerSnapshot | undefined;

  constructor(userId: string) {
    this.userId = userId;
  }

  setStats(totalPlays: number, distinctArtists: number): void {
    this.totalPlays = totalPlays;
    this.distinctArtists = distinctArtists;
  }

  setSkipReason(reason: NonNullable<ForYouTrace["skipReason"]>): void {
    this.skipReason = reason;
  }

  /**
   * Record which ranker configuration was active for this regeneration.
   * Should be called once at the top of `generateForYouPlaylistsWithTrace`
   * before any playlist work; the snapshot is included on the final trace
   * so future readers can reproduce the picks even after the weights
   * have moved on.
   */
  setRanker(snapshot: RankerSnapshot): void {
    this.ranker = snapshot;
  }

  recordSeedCandidate(entry: SeedCandidateTrace): void {
    this.candidates.push(entry);
  }

  recordSeedChosen(artist: string): void {
    this.chosen.push(artist);
  }

  recordSeedSkipped(artist: string, reason: string): void {
    this.skipped.push({ artist, reason });
  }

  recordPlaylist(entry: ForYouPlaylistTrace): void {
    this.playlists.push(entry);
  }

  build(): ForYouTrace {
    return {
      generatedAt: new Date().toISOString(),
      userId: this.userId,
      durationMs: Date.now() - this.startedAt,
      totalPlays: this.totalPlays,
      distinctArtists: this.distinctArtists,
      ...(this.skipReason ? { skipReason: this.skipReason } : {}),
      ...(this.ranker ? { ranker: this.ranker } : {}),
      seedSelection: {
        candidates: this.candidates,
        chosen: this.chosen,
        skipped: this.skipped
      },
      playlists: this.playlists
    };
  }
}

// ── Personal mix traces ────────────────────────────────────────────

export type PersonalVariantId = "discovered-this-year" | "forgotten-favorites" | "album-deep-cuts";

export type PersonalVariantTrace = {
  variant: PersonalVariantId;
  playlistId: string | null;
  candidatePoolSize: number;
  finalTrackCount: number;
  rejection?: string;
  notes?: string[];
};

export type PersonalTrace = {
  generatedAt: string;
  userId: string;
  durationMs: number;
  totalPlays: number;
  distinctArtists: number;
  variants: PersonalVariantTrace[];
};

export class PersonalTraceBuilder {
  private readonly startedAt = Date.now();
  private readonly userId: string;
  private totalPlays = 0;
  private distinctArtists = 0;
  private readonly variants: PersonalVariantTrace[] = [];

  constructor(userId: string) {
    this.userId = userId;
  }

  setStats(totalPlays: number, distinctArtists: number): void {
    this.totalPlays = totalPlays;
    this.distinctArtists = distinctArtists;
  }

  recordVariant(entry: PersonalVariantTrace): void {
    this.variants.push(entry);
  }

  build(): PersonalTrace {
    return {
      generatedAt: new Date().toISOString(),
      userId: this.userId,
      durationMs: Date.now() - this.startedAt,
      totalPlays: this.totalPlays,
      distinctArtists: this.distinctArtists,
      variants: this.variants
    };
  }
}

export class AutoTraceBuilder {
  private readonly startedAt = Date.now();
  private totalCandidateTracks = 0;
  private totalGroups = 0;
  private qualifyingGroups = 0;
  private generatedPlaylists = 0;
  private readonly groups: AutoPlaylistGroupTrace[] = [];

  setTotalCandidateTracks(count: number): void {
    this.totalCandidateTracks = count;
  }

  setTotalGroups(count: number): void {
    this.totalGroups = count;
  }

  setQualifyingGroups(count: number): void {
    this.qualifyingGroups = count;
  }

  setGeneratedPlaylists(count: number): void {
    this.generatedPlaylists = count;
  }

  recordGroup(entry: AutoPlaylistGroupTrace): void {
    this.groups.push(entry);
  }

  build(): AutoTrace {
    return {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - this.startedAt,
      totalCandidateTracks: this.totalCandidateTracks,
      totalGroups: this.totalGroups,
      qualifyingGroups: this.qualifyingGroups,
      generatedPlaylists: this.generatedPlaylists,
      groups: this.groups
    };
  }
}
