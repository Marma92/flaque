import type { IndexStore } from "../indexer/indexStore";
import {
  mergeTrackMetadataOverrides,
  readTrackMetadataOverrides,
  type TrackMetadataOverride
} from "../indexer/metadataOverrideStore";
import { findCoverFileByTrackId } from "../storage/coverService";
import type { Track } from "../../types/library";
import { fetchAndSaveCoverArt, flushCoverArtNegativeCache } from "./coverArtArchiveService";
import {
  flushGenreCache,
  lookupRecordingMetadata,
  type RecordingMetadata
} from "./musicBrainzService";
import { normalizeGenreLabels } from "./genreSynonymService";
import { createLogger } from "../../utils/logger";

const log = createLogger("genre-enrichment");

export type EnrichmentStatus = {
  running: boolean;
  total: number;
  processed: number;
  enriched: number;
  failed: number;
  startedAt: string | null;
};

let status: EnrichmentStatus = {
  running: false,
  total: 0,
  processed: 0,
  enriched: 0,
  failed: 0,
  startedAt: null
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

export type TrackEnrichmentInput = {
  id: string;
  artist: string;
  title: string;
  hasGenre: boolean;
  hasYear: boolean;
  hasCover: boolean;
};

export type TrackEnrichmentResult = {
  genres: string[] | null;
  year: number | null;
  mbidRecording: string | null;
  mbidReleaseGroup: string | null;
  mbidArtist: string | null;
  coverFetched: boolean;
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
    coverFetched: false
  };

  const metadata = await lookupRecordingMetadata(input.artist, input.title);
  if (!metadata) return result;

  const normalizedGenres = normalizeGenreLabels(metadata.genres);
  const fillGenre = !input.hasGenre;
  const fillYear = !input.hasYear;

  const allOverrides = await readTrackMetadataOverrides();
  const existingOverride = allOverrides[input.id];
  const shouldWrite = metadataDiffersFromOverride(
    metadata,
    existingOverride,
    fillGenre,
    fillYear,
    normalizedGenres
  );

  if (shouldWrite) {
    const next: TrackMetadataOverride = { ...(existingOverride ?? {}) };
    if (fillGenre && normalizedGenres.length > 0) next.genre = normalizedGenres;
    if (fillYear && metadata.year !== undefined) next.year = metadata.year;
    if (metadata.recordingMbid) next.mbidRecording = metadata.recordingMbid;
    if (metadata.releaseGroupMbid) next.mbidReleaseGroup = metadata.releaseGroupMbid;
    if (metadata.artistMbid) next.mbidArtist = metadata.artistMbid;
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
    hasCover: options.hasCover ?? true
  });
  return result.genres;
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
    hasCover
  };
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
      startedAt: new Date().toISOString()
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
    startedAt: new Date().toISOString()
  };

  log.info(`Starting metadata enrichment for ${candidates.length} tracks`);

  let anyMetadataWritten = false;

  for (const candidate of candidates) {
    if (signal.aborted) {
      log.info("Metadata enrichment aborted");
      break;
    }

    try {
      const result = await enrichTrackMetadata(candidate);
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
        log.debug(
          `Enriched "${candidate.title}" by "${candidate.artist}"`,
          {
            genres: result.genres ?? undefined,
            year: result.year ?? undefined,
            coverFetched: result.coverFetched
          }
        );
      }
    } catch (error) {
      status.processed++;
      status.failed++;
      log.warn(`Failed to enrich "${candidate.title}" by "${candidate.artist}"`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  status.running = false;
  abortController = null;
  flushGenreCache();
  flushCoverArtNegativeCache();
  if (anyMetadataWritten) {
    await indexStore.rebuild();
  }
  log.info(
    `Metadata enrichment complete: ${status.enriched} enriched, ${status.failed} failed, ${status.processed} processed out of ${status.total}`
  );
}
