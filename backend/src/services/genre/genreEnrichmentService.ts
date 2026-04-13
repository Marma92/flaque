import type { IndexStore } from "../indexer/indexStore";
import { mergeTrackMetadataOverrides } from "../indexer/metadataOverrideStore";
import { lookupGenre } from "./musicBrainzService";
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

export async function enrichTrackGenre(
  trackId: string,
  artist: string,
  title: string
): Promise<string[] | null> {
  const rawGenres = await lookupGenre(artist, title);
  if (rawGenres.length === 0) return null;

  const genres = normalizeGenreLabels(rawGenres);
  if (genres.length === 0) return null;

  await mergeTrackMetadataOverrides({ [trackId]: { genre: genres } });
  return genres;
}

export async function runBackgroundEnrichment(indexStore: IndexStore): Promise<void> {
  if (status.running) {
    log.info("Genre enrichment already running, skipping");
    return;
  }

  const tracks = indexStore.getTracks();
  const tracksWithoutGenre = tracks.filter(
    (t) => !t.tags.genre || t.tags.genre.length === 0
  );

  if (tracksWithoutGenre.length === 0) {
    log.info("All tracks have genre metadata, nothing to enrich");
    return;
  }

  abortController = new AbortController();
  const signal = abortController.signal;

  status = {
    running: true,
    total: tracksWithoutGenre.length,
    processed: 0,
    enriched: 0,
    failed: 0,
    startedAt: new Date().toISOString()
  };

  log.info(`Starting genre enrichment for ${tracksWithoutGenre.length} tracks`);

  for (const track of tracksWithoutGenre) {
    if (signal.aborted) {
      log.info("Genre enrichment aborted");
      break;
    }

    const artist = track.tags.artist;
    const title = track.tags.title;

    if (!artist || !title) {
      status.processed++;
      continue;
    }

    try {
      const genres = await enrichTrackGenre(track.id, artist, title);
      status.processed++;
      if (genres) {
        status.enriched++;
        log.debug(`Enriched genre for "${title}" by "${artist}": ${genres.join(", ")}`);
      }
    } catch (error) {
      status.processed++;
      status.failed++;
      log.warn(`Failed to enrich genre for "${title}" by "${artist}"`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  status.running = false;
  abortController = null;
  log.info(
    `Genre enrichment complete: ${status.enriched} enriched, ${status.failed} failed, ${status.processed} processed out of ${status.total}`
  );
}
