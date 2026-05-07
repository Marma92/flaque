import fs from "node:fs/promises";
import path from "node:path";

import { appendTrackActivityLogEntries } from "../../services/activity/trackActivityStore";
import { computeAndSaveEmbedding } from "../../services/embeddings/audioEmbeddingService";
import { enrichTrackGenre } from "../../services/genre/genreEnrichmentService";
import { mergeTrackMetadataOverrides } from "../../services/indexer/metadataOverrideStore";
import { IndexStore } from "../../services/indexer/indexStore";
import {
  processUploadedFile,
  type ProcessedUpload,
  type UploadMetadataOverride
} from "../../services/upload/uploadService";
import { ensureSharedMusicDir } from "../../services/storage/storageService";
import type { Track } from "../../types/library";
import { fileExists } from "../../utils/fs";
import { createLogger } from "../../utils/logger";
import { getAudioMimeType, isSupportedAudioFile } from "../../utils/mime";
import { tmpUploadsRoot } from "../../utils/paths";
import { isPathInside } from "./multer";

const log = createLogger("upload");

export type IngestOptions = {
  ownerId: string;
  manualArtist?: string;
  manualAlbum?: string;
  manualYear?: number;
  deferRebuild: boolean;
  metadataOverrides: UploadMetadataOverride[];
};

export type IngestResult = {
  processed: number;
  uploaded: number;
  deduplicated: number;
  tracks: Track[];
  deferredRebuild: boolean;
};

/**
 * Shared ingest pipeline used by both the direct /upload route and the
 * /upload/finalize route that consumes an already-assembled chunked upload.
 *
 * Runs processUploadedFile on every file, merges metadata overrides,
 * rebuilds the index (unless deferred), resolves the authoritative Track
 * snapshots, appends new uploads to the activity log, and builds the
 * response body. Does NOT send the response or clean up temp files — that
 * remains the caller's responsibility since the failure-mode cleanup shape
 * is route-specific.
 */
export async function ingestUploadedFiles(
  indexStore: IndexStore,
  files: Express.Multer.File[],
  options: IngestOptions
): Promise<IngestResult> {
  const musicDir = await ensureSharedMusicDir();
  const results: ProcessedUpload[] = [];

  for (const [index, uploadedFile] of files.entries()) {
    results.push(
      await processUploadedFile(
        uploadedFile,
        options.ownerId,
        musicDir,
        options.manualArtist,
        options.manualAlbum,
        options.metadataOverrides[index] ?? {},
        options.manualYear
      )
    );
  }

  const metadataOverridePatch: Record<string, { title?: string; artist?: string; album?: string; year?: number }> = {};
  for (const result of results) {
    if (result.overrides) {
      metadataOverridePatch[result.trackId] = result.overrides;
    }
  }

  if (Object.keys(metadataOverridePatch).length > 0) {
    await mergeTrackMetadataOverrides(metadataOverridePatch);
  }

  const updatedIndex = options.deferRebuild ? indexStore.getSnapshot() : await indexStore.rebuild();
  const provisionalById = new Map(results.map((r) => [r.trackId, r.track]));

  const resolveTrack = (result: ProcessedUpload): Track | undefined =>
    updatedIndex.tracks.find((candidate) => candidate.id === result.trackId) ??
    provisionalById.get(result.trackId);

  const tracks = results
    .map(resolveTrack)
    .filter((track): track is Track => Boolean(track));

  const newUploadTracks = results
    .filter((result) => result.isNew)
    .map(resolveTrack)
    .filter((track): track is Track => Boolean(track));

  if (newUploadTracks.length > 0) {
    await appendTrackActivityLogEntries(newUploadTracks);
  }

  for (const track of newUploadTracks) {
    if (!track.tags.genre || track.tags.genre.length === 0) {
      const artist = track.tags.artist;
      const title = track.tags.title;
      if (artist && title) {
        void enrichTrackGenre(track.id, artist, title).catch(() => {});
      }
    }
    void computeAndSaveEmbedding(track.id, track.path).catch(() => {});
  }

  const deduplicated = results.filter((r) => !r.isNew).length;
  const uploaded = results.length - deduplicated;

  const trackTitles = tracks
    .map((track) => track.tags.title ?? track.path)
    .slice(0, 10);

  log.info("Upload complete", {
    owner: options.ownerId,
    processed: results.length,
    uploaded,
    deduplicated,
    titles: trackTitles
  });

  return {
    processed: results.length,
    uploaded,
    deduplicated,
    tracks,
    deferredRebuild: options.deferRebuild
  };
}

export type ResolvedTempFile =
  | { ok: true; file: Express.Multer.File }
  | { ok: false; status: number; error: string };

/**
 * Validate a tempPath supplied by /upload/finalize and return a synthetic
 * Multer.File that downstream code can treat as if it came from a direct
 * upload. The path must live inside tmpUploadsRoot, exist, point to a
 * supported audio format, and not exceed maxBytes. An oversized file is
 * unlinked before returning the error so we don't leave large temp files
 * lying around.
 */
export async function resolveTempPathFile(
  tempPath: string,
  originalFileName: string | undefined,
  maxBytes: number
): Promise<ResolvedTempFile> {
  if (!isPathInside(tempPath, tmpUploadsRoot)) {
    return { ok: false, status: 400, error: "Invalid tempPath" };
  }

  const resolvedTempPath = path.resolve(tempPath);
  const exists = await fileExists(resolvedTempPath);
  if (!exists) {
    return { ok: false, status: 404, error: "Temporary upload not found" };
  }

  const displayName = originalFileName ?? path.basename(resolvedTempPath);
  if (!isSupportedAudioFile(displayName)) {
    return { ok: false, status: 400, error: "Unsupported audio format" };
  }

  const stat = await fs.stat(resolvedTempPath);
  if (stat.size > maxBytes) {
    await fs.unlink(resolvedTempPath).catch(() => {});
    return {
      ok: false,
      status: 413,
      error: `File exceeds maximum upload size of ${maxBytes} bytes`
    };
  }

  const file = {
    path: resolvedTempPath,
    originalname: displayName,
    size: stat.size,
    mimetype: getAudioMimeType(displayName)
  } as Express.Multer.File;

  return { ok: true, file };
}

export async function cleanupTemporaryFiles(filePaths: string[]): Promise<void> {
  await Promise.all(
    filePaths.map(async (filePath) => {
      if (!(await fileExists(filePath))) {
        return;
      }

      await fs.unlink(filePath);
    })
  );
}
