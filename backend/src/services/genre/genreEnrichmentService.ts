import type { IndexStore } from "../indexer/indexStore";
import {
  mergeTrackMetadataOverrides,
  readTrackMetadataOverrides,
  type TrackMetadataOverride,
  type TrackMetadataProvenance
} from "../indexer/metadataOverrideStore";
import { findCoverFileByTrackId } from "../storage/coverService";
import { resolveTrackAbsolutePath } from "../storage/storageService";
import type { Track } from "../../types/library";
import {
  flushAcoustIdCache,
  isAcoustIdConfigured,
  lookupRecordingByFingerprint
} from "./acoustIdService";
import { fetchAndSaveCoverArt, flushCoverArtNegativeCache } from "./coverArtArchiveService";
import {
  computeTrackFingerprint,
  flushFingerprintCache,
  isFingerprintingDisabled
} from "./fingerprintService";
import {
  flushGenreCache,
  invalidateCacheEntry,
  invalidateMbidCacheEntry,
  lookupRecordingMetadata,
  lookupRecordingMetadataByMbid,
  lookupReleaseGroup,
  type RecordingMetadata,
  type ReleaseGroupMetadata
} from "./musicBrainzService";
import { normalizeGenreLabels } from "./genreSynonymService";
import { appendEnrichmentLog, type EnrichmentLogEntry } from "./enrichmentLogStore";
import { createLogger } from "../../utils/logger";

const log = createLogger("genre-enrichment");

export type EnrichmentCurrentTrack = {
  trackId: string;
  artist: string;
  title: string;
};

export type EnrichmentStatus = {
  running: boolean;
  total: number;
  processed: number;
  enriched: number;
  failed: number;
  startedAt: string | null;
  currentTrack: EnrichmentCurrentTrack | null;
};

let status: EnrichmentStatus = {
  running: false,
  total: 0,
  processed: 0,
  enriched: 0,
  failed: 0,
  startedAt: null,
  currentTrack: null
};

let abortController: AbortController | null = null;

export function getEnrichmentStatus(): EnrichmentStatus {
  return { ...status };
}

export function stopEnrichment(): void {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

export type EnrichmentSource = "bulk" | "single" | "upload";

export type TrackEnrichmentInput = {
  id: string;
  artist: string;
  title: string;
  hasGenre: boolean;
  hasYear: boolean;
  hasCover: boolean;
  source?: EnrichmentSource;
  /**
   * Absolute path to the audio file on disk. Required for the AcoustID
   * fingerprint fallback. When omitted, fingerprint lookup is skipped.
   */
  absolutePath?: string;
  /**
   * Track's album tag, if any. Used by the bulk runner to group tracks
   * into album cohorts for single-lookup enrichment.
   */
  album?: string;
};

export type TrackEnrichmentResult = {
  genres: string[] | null;
  year: number | null;
  mbidRecording: string | null;
  mbidReleaseGroup: string | null;
  mbidArtist: string | null;
  coverFetched: boolean;
  resolvedViaFingerprint: boolean;
};

function metadataDiffersFromOverride(
  metadata: RecordingMetadata,
  override: TrackMetadataOverride | undefined,
  fillGenre: boolean,
  fillYear: boolean,
  normalizedGenres: string[]
): boolean {
  const next: TrackMetadataOverride = { ...(override ?? {}) };
  let changed = false;

  if (fillGenre && normalizedGenres.length > 0) {
    if (JSON.stringify(next.genre) !== JSON.stringify(normalizedGenres)) {
      next.genre = normalizedGenres;
      changed = true;
    }
  }

  if (fillYear && metadata.year !== undefined && next.year !== metadata.year) {
    next.year = metadata.year;
    changed = true;
  }

  if (metadata.recordingMbid && next.mbidRecording !== metadata.recordingMbid) {
    next.mbidRecording = metadata.recordingMbid;
    changed = true;
  }

  if (metadata.releaseGroupMbid && next.mbidReleaseGroup !== metadata.releaseGroupMbid) {
    next.mbidReleaseGroup = metadata.releaseGroupMbid;
    changed = true;
  }

  if (metadata.artistMbid && next.mbidArtist !== metadata.artistMbid) {
    next.mbidArtist = metadata.artistMbid;
    changed = true;
  }

  return changed;
}

function buildLogEntry(
  input: TrackEnrichmentInput,
  result: TrackEnrichmentResult,
  metadataReturned: boolean,
  source: EnrichmentSource
): EnrichmentLogEntry {
  const wroteAnything =
    result.genres !== null ||
    result.year !== null ||
    result.mbidRecording !== null ||
    result.mbidReleaseGroup !== null ||
    result.mbidArtist !== null ||
    result.coverFetched;

  const status: EnrichmentLogEntry["status"] = !metadataReturned
    ? "miss"
    : wroteAnything
      ? "hit"
      : "skipped";

  return {
    timestamp: new Date().toISOString(),
    trackId: input.id,
    artist: input.artist,
    title: input.title,
    source,
    status,
    ...(result.genres ? { filledGenre: result.genres } : {}),
    ...(result.year !== null ? { filledYear: result.year } : {}),
    ...(result.mbidRecording ? { filledRecordingMbid: result.mbidRecording } : {}),
    ...(result.mbidReleaseGroup ? { filledReleaseGroupMbid: result.mbidReleaseGroup } : {}),
    ...(result.mbidArtist ? { filledArtistMbid: result.mbidArtist } : {}),
    ...(result.coverFetched ? { coverFetched: true } : {}),
    ...(result.resolvedViaFingerprint ? { resolvedViaFingerprint: true } : {})
  };
}

/**
 * Enrich a single track. Looks up the recording on MusicBrainz, fills missing
 * genre/year/MBID overrides without clobbering existing ones, and downloads
 * the front cover from the Cover Art Archive when the track has no embedded
 * art and we have a release-group MBID.
 */
export async function enrichTrackMetadata(input: TrackEnrichmentInput): Promise<TrackEnrichmentResult> {
  const result: TrackEnrichmentResult = {
    genres: null,
    year: null,
    mbidRecording: null,
    mbidReleaseGroup: null,
    mbidArtist: null,
    coverFetched: false,
    resolvedViaFingerprint: false
  };

  // Read overrides up front so we can prefer the stored MBID over a name
  // search and respect per-field provenance when filling.
  const allOverrides = await readTrackMetadataOverrides();
  const existingOverride = allOverrides[input.id];

  let metadata: RecordingMetadata | null = null;

  // 1. Fast path: if we already know the recording MBID, fetch detail
  // directly. Skips the fragile name-search and gives deterministic
  // results regardless of how the artist/title tags drifted later.
  if (existingOverride?.mbidRecording) {
    metadata = await lookupRecordingMetadataByMbid(existingOverride.mbidRecording);
  }

  // 2. Name-search by artist+title.
  if (!metadata) {
    metadata = await lookupRecordingMetadata(input.artist, input.title);
  }

  // 3. Fingerprint fallback (Phase 4): if we have a file path + AcoustID
  // is configured + fpcalc is available, try to resolve the recording by
  // audio fingerprint. This rescues tracks with broken or generic tags.
  if (
    !metadata &&
    input.absolutePath &&
    isAcoustIdConfigured() &&
    !isFingerprintingDisabled()
  ) {
    const fingerprint = await computeTrackFingerprint(input.id, input.absolutePath);
    if (fingerprint) {
      const acoustHit = await lookupRecordingByFingerprint(
        fingerprint.fingerprint,
        fingerprint.duration
      );
      if (acoustHit) {
        metadata = await lookupRecordingMetadataByMbid(acoustHit.recordingMbid);
        if (metadata) result.resolvedViaFingerprint = true;
      }
    }
  }

  if (!metadata) {
    appendEnrichmentLog(buildLogEntry(input, result, false, input.source ?? "bulk"));
    return result;
  }

  const normalizedGenres = normalizeGenreLabels(metadata.genres);
  const provenance = existingOverride?.provenance;

  // Provenance gate: never auto-overwrite a field the admin marked
  // "manual". Otherwise fall back to the existing "only fill missing"
  // rule.
  const fillGenre = provenance?.genre !== "manual" && !input.hasGenre;
  const fillYear = provenance?.year !== "manual" && !input.hasYear;

  const shouldWrite = metadataDiffersFromOverride(
    metadata,
    existingOverride,
    fillGenre,
    fillYear,
    normalizedGenres
  );

  if (shouldWrite) {
    const next: TrackMetadataOverride = { ...(existingOverride ?? {}) };
    const nextProvenance: TrackMetadataProvenance = { ...(existingOverride?.provenance ?? {}) };
    if (fillGenre && normalizedGenres.length > 0) {
      next.genre = normalizedGenres;
      nextProvenance.genre = "auto";
    }
    if (fillYear && metadata.year !== undefined) {
      next.year = metadata.year;
      nextProvenance.year = "auto";
    }
    if (metadata.recordingMbid) next.mbidRecording = metadata.recordingMbid;
    if (metadata.releaseGroupMbid) next.mbidReleaseGroup = metadata.releaseGroupMbid;
    if (metadata.artistMbid) next.mbidArtist = metadata.artistMbid;
    next.provenance = Object.keys(nextProvenance).length > 0 ? nextProvenance : undefined;
    await mergeTrackMetadataOverrides({ [input.id]: next });
  }

  if (fillGenre && normalizedGenres.length > 0) result.genres = normalizedGenres;
  if (fillYear && metadata.year !== undefined) result.year = metadata.year;
  result.mbidRecording = metadata.recordingMbid ?? null;
  result.mbidReleaseGroup = metadata.releaseGroupMbid ?? null;
  result.mbidArtist = metadata.artistMbid ?? null;

  if (!input.hasCover && metadata.releaseGroupMbid) {
    const fetchResult = await fetchAndSaveCoverArt(input.id, metadata.releaseGroupMbid);
    if (fetchResult.kind === "saved") {
      result.coverFetched = true;
    }
  }

  appendEnrichmentLog(buildLogEntry(input, result, true, input.source ?? "bulk"));
  return result;
}

/**
 * Backwards-compatible thin wrapper used by the upload-time hook in
 * `api/upload/ingest.ts`. Newly uploaded tracks always have their freshly
 * extracted state in hand at the call site, so we treat them as
 * "missing genre" only when the caller passes us tracks that already lack
 * one. The richer enrichTrackMetadata is preferred for new code.
 */
export async function enrichTrackGenre(
  trackId: string,
  artist: string,
  title: string,
  options: { hasYear?: boolean; hasCover?: boolean } = {}
): Promise<string[] | null> {
  const result = await enrichTrackMetadata({
    id: trackId,
    artist,
    title,
    hasGenre: false,
    hasYear: options.hasYear ?? true,
    hasCover: options.hasCover ?? true,
    source: "upload"
  });
  return result.genres;
}

/**
 * Trigger a fresh MB lookup for one specific track. Drops the cached entry
 * for (artist, title) so the next call hits MusicBrainz, then fills any
 * currently-missing fields. Used by the admin "re-enrich" button.
 */
export async function reEnrichTrack(track: Track, indexStore?: IndexStore): Promise<TrackEnrichmentResult> {
  const artist = track.tags.artist;
  const title = track.tags.title;
  if (!artist || !title) {
    return {
      genres: null,
      year: null,
      mbidRecording: null,
      mbidReleaseGroup: null,
      mbidArtist: null,
      coverFetched: false,
      resolvedViaFingerprint: false
    };
  }

  invalidateCacheEntry(artist, title);

  // If the track already has a stored MBID, drop its mbid-keyed cache
  // entry too so the re-enrich actually hits MusicBrainz instead of
  // serving a stale rich-cache hit.
  const allOverrides = await readTrackMetadataOverrides();
  const storedMbid = allOverrides[track.id]?.mbidRecording;
  if (storedMbid) invalidateMbidCacheEntry(storedMbid);

  const cover = await findCoverFileByTrackId(track.id);
  const result = await enrichTrackMetadata({
    id: track.id,
    artist,
    title,
    hasGenre: Array.isArray(track.tags.genre) && track.tags.genre.length > 0,
    hasYear: typeof track.tags.year === "number",
    hasCover: cover !== null,
    source: "single",
    absolutePath: resolveTrackAbsolutePath(track.path)
  });

  const wroteMetadata =
    result.genres !== null ||
    result.year !== null ||
    result.mbidRecording !== null ||
    result.mbidReleaseGroup !== null ||
    result.mbidArtist !== null;

  if (wroteMetadata && indexStore) {
    await indexStore.rebuild();
  }

  return result;
}

function describeTrackEnrichmentNeeds(track: Track, hasCover: boolean): TrackEnrichmentInput | null {
  const artist = track.tags.artist;
  const title = track.tags.title;
  if (!artist || !title) return null;

  const hasGenre = Array.isArray(track.tags.genre) && track.tags.genre.length > 0;
  const hasYear = typeof track.tags.year === "number";

  if (hasGenre && hasYear && hasCover) return null;

  return {
    id: track.id,
    artist,
    title,
    hasGenre,
    hasYear,
    hasCover,
    source: "bulk",
    absolutePath: resolveTrackAbsolutePath(track.path),
    album: track.tags.album
  };
}

/**
 * Apply album-level metadata (year, genre, release-group MBID, artist
 * MBID) and a Cover Art Archive cover to a single track. Mirrors
 * enrichTrackMetadata's writing/provenance logic but uses a pre-fetched
 * ReleaseGroupMetadata so we don't hit MB per track. recordingMbid is
 * NOT touched — that remains a per-recording lookup concern.
 */
export async function applyAlbumMetadataToTrack(
  input: TrackEnrichmentInput,
  rgMeta: ReleaseGroupMetadata
): Promise<TrackEnrichmentResult> {
  const result: TrackEnrichmentResult = {
    genres: null,
    year: null,
    mbidRecording: null,
    mbidReleaseGroup: null,
    mbidArtist: null,
    coverFetched: false,
    resolvedViaFingerprint: false
  };

  const allOverrides = await readTrackMetadataOverrides();
  const existingOverride = allOverrides[input.id];
  const provenance = existingOverride?.provenance;
  const normalizedGenres = normalizeGenreLabels(rgMeta.genres);

  const fillGenre = provenance?.genre !== "manual" && !input.hasGenre && normalizedGenres.length > 0;
  const fillYear = provenance?.year !== "manual" && !input.hasYear && rgMeta.year !== undefined;
  const setReleaseGroup = !!rgMeta.releaseGroupMbid && existingOverride?.mbidReleaseGroup !== rgMeta.releaseGroupMbid;
  const setArtist = !!rgMeta.artistMbid && existingOverride?.mbidArtist !== rgMeta.artistMbid;

  if (fillGenre || fillYear || setReleaseGroup || setArtist) {
    const next: TrackMetadataOverride = { ...(existingOverride ?? {}) };
    const nextProvenance: TrackMetadataProvenance = { ...(existingOverride?.provenance ?? {}) };
    if (fillGenre) {
      next.genre = normalizedGenres;
      nextProvenance.genre = "auto";
    }
    if (fillYear) {
      next.year = rgMeta.year;
      nextProvenance.year = "auto";
    }
    if (setReleaseGroup) next.mbidReleaseGroup = rgMeta.releaseGroupMbid;
    if (setArtist) next.mbidArtist = rgMeta.artistMbid;
    next.provenance = Object.keys(nextProvenance).length > 0 ? nextProvenance : undefined;
    await mergeTrackMetadataOverrides({ [input.id]: next });
  }

  if (fillGenre) result.genres = normalizedGenres;
  if (fillYear && rgMeta.year !== undefined) result.year = rgMeta.year;
  result.mbidReleaseGroup = rgMeta.releaseGroupMbid;
  result.mbidArtist = rgMeta.artistMbid ?? null;

  if (!input.hasCover && rgMeta.releaseGroupMbid) {
    const fetchResult = await fetchAndSaveCoverArt(input.id, rgMeta.releaseGroupMbid);
    if (fetchResult.kind === "saved") result.coverFetched = true;
  }

  appendEnrichmentLog({
    ...buildLogEntry(input, result, true, input.source ?? "bulk")
  });
  return result;
}

/**
 * True when the track has nothing left to gain from a per-recording
 * lookup after the album cohort filled what it could. Cover is treated
 * as best-effort: if the cohort's release-group has no art (or the
 * fetch was throttled), per-track lookup wouldn't find a different
 * cover for the same release-group, so we don't fall through on a
 * cover-only miss.
 */
function trackIsFullyCoveredByCohort(input: TrackEnrichmentInput, result: TrackEnrichmentResult): boolean {
  const stillNeedsGenre = !input.hasGenre && result.genres === null;
  const stillNeedsYear = !input.hasYear && result.year === null;
  return !stillNeedsGenre && !stillNeedsYear;
}

export async function runBackgroundEnrichment(indexStore: IndexStore): Promise<void> {
  if (status.running) {
    log.info("Genre enrichment already running, skipping");
    return;
  }

  await indexStore.rebuild();

  const tracks = indexStore.getTracks();
  const candidates: TrackEnrichmentInput[] = [];
  for (const track of tracks) {
    const cover = await findCoverFileByTrackId(track.id);
    const needs = describeTrackEnrichmentNeeds(track, cover !== null);
    if (needs) candidates.push(needs);
  }

  if (candidates.length === 0) {
    log.info("All tracks have full metadata, nothing to enrich");
    status = {
      running: false,
      total: 0,
      processed: 0,
      enriched: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
      currentTrack: null
    };
    return;
  }

  abortController = new AbortController();
  const signal = abortController.signal;

  status = {
    running: true,
    total: candidates.length,
    processed: 0,
    enriched: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    currentTrack: null
  };

  // Group candidates into album cohorts. Tracks without an album, or
  // albums with a single member, go straight to per-track lookup —
  // there's no efficiency win for a singleton.
  const cohortMap = new Map<string, TrackEnrichmentInput[]>();
  const singletons: TrackEnrichmentInput[] = [];
  for (const candidate of candidates) {
    const albumKey = candidate.album?.trim();
    if (!albumKey) {
      singletons.push(candidate);
      continue;
    }
    const key = `${candidate.artist.trim().toLowerCase()}|||${albumKey.toLowerCase()}`;
    const existing = cohortMap.get(key);
    if (existing) existing.push(candidate);
    else cohortMap.set(key, [candidate]);
  }

  const perTrackQueue: TrackEnrichmentInput[] = [...singletons];
  for (const members of cohortMap.values()) {
    if (members.length < 2) {
      perTrackQueue.push(...members);
    }
  }

  log.info(
    `Starting metadata enrichment for ${candidates.length} tracks ` +
    `(${[...cohortMap.values()].filter((m) => m.length >= 2).length} album cohort(s), ` +
    `${perTrackQueue.length} per-track)`
  );

  let anyMetadataWritten = false;

  const recordTrackResult = (
    input: TrackEnrichmentInput,
    result: TrackEnrichmentResult
  ): void => {
    status.processed++;
    const wroteMetadata =
      result.genres !== null ||
      result.year !== null ||
      result.mbidRecording !== null ||
      result.mbidReleaseGroup !== null ||
      result.mbidArtist !== null;
    if (wroteMetadata || result.coverFetched) {
      status.enriched++;
      if (wroteMetadata) anyMetadataWritten = true;
      log.debug(`Enriched "${input.title}" by "${input.artist}"`, {
        genres: result.genres ?? undefined,
        year: result.year ?? undefined,
        coverFetched: result.coverFetched
      });
    }
  };

  const recordTrackFailure = (input: TrackEnrichmentInput, error: unknown): void => {
    status.processed++;
    status.failed++;
    log.warn(`Failed to enrich "${input.title}" by "${input.artist}"`, {
      error: error instanceof Error ? error.message : String(error)
    });
    appendEnrichmentLog({
      timestamp: new Date().toISOString(),
      trackId: input.id,
      artist: input.artist,
      title: input.title,
      source: "bulk",
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error)
    });
  };

  // Album cohort pass: one MB lookup per album, applied to every member.
  for (const [, members] of cohortMap) {
    if (signal.aborted) {
      log.info("Metadata enrichment aborted");
      break;
    }
    if (members.length < 2) continue;

    const first = members[0]!;
    status.currentTrack = {
      trackId: first.id,
      artist: first.artist,
      title: `${first.album ?? ""} (album)`
    };

    let rgMeta: ReleaseGroupMetadata | null = null;
    try {
      rgMeta = await lookupReleaseGroup(first.artist, first.album!);
    } catch (error) {
      log.warn(`Album cohort lookup failed for "${first.album}" by "${first.artist}"`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    if (!rgMeta) {
      // Cohort lookup missed — fall back to per-track for every member.
      perTrackQueue.push(...members);
      continue;
    }

    for (const member of members) {
      if (signal.aborted) break;
      status.currentTrack = {
        trackId: member.id,
        artist: member.artist,
        title: member.title
      };
      try {
        const result = await applyAlbumMetadataToTrack(member, rgMeta);
        recordTrackResult(member, result);
        if (!trackIsFullyCoveredByCohort(member, result)) {
          // Cohort didn't fully cover this track (e.g. missing genre
          // because rgMeta had none, or cover failed). Queue for the
          // per-track path to take another swing.
          perTrackQueue.push(member);
          // Roll back the cohort-pass processed count so the per-track
          // pass increments it again — avoids double-counting.
          status.processed--;
          if (result.genres || result.year || result.coverFetched || result.mbidReleaseGroup || result.mbidArtist) {
            status.enriched--;
          }
        }
      } catch (error) {
        recordTrackFailure(member, error);
      }
    }
  }

  // Per-track pass: singletons and tracks the cohort path couldn't fully
  // cover.
  for (const candidate of perTrackQueue) {
    if (signal.aborted) {
      log.info("Metadata enrichment aborted");
      break;
    }

    status.currentTrack = {
      trackId: candidate.id,
      artist: candidate.artist,
      title: candidate.title
    };

    try {
      const result = await enrichTrackMetadata(candidate);
      recordTrackResult(candidate, result);
    } catch (error) {
      recordTrackFailure(candidate, error);
    }
  }

  status.running = false;
  status.currentTrack = null;
  abortController = null;
  flushGenreCache();
  flushCoverArtNegativeCache();
  flushFingerprintCache();
  flushAcoustIdCache();
  if (anyMetadataWritten) {
    await indexStore.rebuild();
  }
  log.info(
    `Metadata enrichment complete: ${status.enriched} enriched, ${status.failed} failed, ${status.processed} processed out of ${status.total}`
  );
}

/**
 * Re-apply the current synonym table to all existing genre overrides.
 * Used when the admin updates synonyms and wants to fix up the library
 * without re-running an MB enrichment. Returns counts of changed/scanned
 * tracks. Triggers an index rebuild if anything changed.
 */
export async function reapplySynonymsToOverrides(indexStore: IndexStore): Promise<{ scanned: number; updated: number }> {
  const overrides = await readTrackMetadataOverrides();
  let scanned = 0;
  let updated = 0;
  const patch: Record<string, TrackMetadataOverride> = {};

  for (const [trackId, override] of Object.entries(overrides)) {
    if (!override.genre || override.genre.length === 0) continue;
    scanned++;
    const renormalized = normalizeGenreLabels(override.genre);
    if (JSON.stringify(renormalized) === JSON.stringify(override.genre)) continue;
    patch[trackId] = { ...override, genre: renormalized };
    updated++;
  }

  if (updated > 0) {
    await mergeTrackMetadataOverrides(patch);
    await indexStore.rebuild();
  }

  return { scanned, updated };
}
