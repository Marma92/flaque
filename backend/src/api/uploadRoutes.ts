import fs from "node:fs/promises";
import path from "node:path";

import multer from "multer";
import { Router, type NextFunction, type Response } from "express";

import { requireAuth } from "../auth/middleware";
import { appendTrackActivityLogEntries, readTrackActivityLog } from "../services/activity/trackActivityStore";
import { mergeTrackMetadataOverrides } from "../services/indexer/metadataOverrideStore";
import { IndexStore } from "../services/indexer/indexStore";

import {
  processUploadedFile,
  sanitizeExtension,
  type ProcessedUpload,
  type UploadMetadataOverride
} from "../services/upload/uploadService";
import {
  initChunkedUpload,
  getOwnedSession,
  saveChunk,
  assembleChunks,
  cancelChunkedUpload,
  getChunkSize,
  SessionForbiddenError
} from "../services/upload/chunkedUploadService";
import type { Track } from "../types/library";
import { fileExists } from "../utils/fs";
import { getAudioMimeType, getSupportedAudioExtensions, isSupportedAudioFile } from "../utils/mime";
import { tmpUploadsRoot } from "../utils/paths";
import { ensureSharedMusicDir } from "../services/storage/storageService";
import { checkStorageAndWarnAdmins } from "../services/storage/storageWarningService";
import { createLogger } from "../utils/logger";
import { normalizeOptionalString, parseBooleanField } from "../utils/validation";

const log = createLogger("upload");

const DEFAULT_MAX_UPLOAD_FILES = 50;
const DEFAULT_MAX_UPLOAD_BYTES = 2_147_483_648;

function getMaxUploadBytes(): number {
  const raw = Number(process.env.MAX_UPLOAD_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_UPLOAD_BYTES;
}

function getMaxUploadFiles(): number {
  const raw = Number(process.env.MAX_UPLOAD_FILES ?? DEFAULT_MAX_UPLOAD_FILES);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_UPLOAD_FILES;
}

function isPathInside(candidate: string, parent: string): boolean {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedParent = path.resolve(parent);
  if (resolvedCandidate === resolvedParent) {
    return false;
  }
  const withSep = resolvedParent.endsWith(path.sep) ? resolvedParent : resolvedParent + path.sep;
  return resolvedCandidate.startsWith(withSep);
}

export function parseUploadMetadataOverrides(value: unknown): UploadMetadataOverride[] {
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((entry) => {
      if (!entry || typeof entry !== "object") {
        return {};
      }

      const rawYear = (entry as { year?: unknown }).year;
      let year: number | undefined;
      if (rawYear !== undefined && rawYear !== null) {
        const n = typeof rawYear === "number" ? rawYear : Number(rawYear);
        if (Number.isInteger(n) && n >= 1000 && n <= 2999) {
          year = n;
        }
      }

      return {
        title: normalizeOptionalString((entry as { title?: unknown }).title),
        artist: normalizeOptionalString((entry as { artist?: unknown }).artist),
        album: normalizeOptionalString((entry as { album?: unknown }).album),
        year
      };
    });
  } catch {
    return [];
  }
}

export function collectUploadedFiles(files: unknown): Express.Multer.File[] {
  if (!files) {
    return [];
  }

  if (Array.isArray(files)) {
    return files as Express.Multer.File[];
  }

  const byFieldName = files as Record<string, Express.Multer.File[] | undefined>;
  return [...(byFieldName.files ?? []), ...(byFieldName.file ?? [])];
}

async function cleanupTemporaryFiles(filePaths: string[]): Promise<void> {
  await Promise.all(
    filePaths.map(async (filePath) => {
      if (!(await fileExists(filePath))) {
        return;
      }

      await fs.unlink(filePath);
    })
  );
}

function createAudioUpload(maxUploadBytes: number): multer.Multer {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        callback(null, tmpUploadsRoot);
      },
      filename: (_req, file, callback) => {
        callback(
          null,
          `${Date.now()}-${Math.random().toString(36).slice(2)}${sanitizeExtension(file.originalname)}`
        );
      }
    }),
    limits: {
      fileSize: maxUploadBytes
    },
    fileFilter: (_req, file, callback) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (getSupportedAudioExtensions().includes(ext)) {
        callback(null, true);
        return;
      }
      callback(new Error("Unsupported audio format"));
    }
  });
}

// Chunks are raw binary blobs from File.slice() with no audio extension; they
// need memory storage (so req.file.buffer is populated) and no audio-extension
// filter. The per-chunk cap is CHUNK_SIZE plus a small overhead for multipart
// framing.
function createChunkUpload(): multer.Multer {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: getChunkSize() + 1024 * 1024
    }
  });
}

type IngestOptions = {
  ownerId: string;
  manualArtist?: string;
  manualAlbum?: string;
  manualYear?: number;
  deferRebuild: boolean;
  metadataOverrides: UploadMetadataOverride[];
};

type IngestResult = {
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
async function ingestUploadedFiles(
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

type ResolvedTempFile =
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
async function resolveTempPathFile(
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

function requireOwnerId(req: { authUser?: { id?: string } }, res: Response): string | undefined {
  const ownerId = req.authUser?.id;
  if (!ownerId) {
    res.status(401).json({ error: "Authentication required" });
    return undefined;
  }
  return ownerId;
}

function requireSessionId(req: { body?: Record<string, unknown> }, res: Response): string | undefined {
  const sessionId = normalizeOptionalString(req.body?.sessionId);
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required" });
    return undefined;
  }
  return sessionId;
}

type ParsedUploadRequestBody = {
  manualArtist?: string;
  manualAlbum?: string;
  manualYear?: number;
  deferRebuild: boolean;
  metadataOverrides: UploadMetadataOverride[];
};

function parseManualYear(value: unknown): number | undefined {
  const raw = normalizeOptionalString(value);
  if (!raw) {
    return undefined;
  }
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1000 && n <= 2999) {
    return n;
  }
  return undefined;
}

function parseUploadRequestBody(body: unknown): ParsedUploadRequestBody {
  const source = (body ?? {}) as Record<string, unknown>;
  return {
    manualArtist: normalizeOptionalString(source.artist),
    manualAlbum: normalizeOptionalString(source.album),
    manualYear: parseManualYear(source.year),
    deferRebuild: parseBooleanField(source.deferRebuild),
    metadataOverrides: parseUploadMetadataOverrides(source.metadataOverrides)
  };
}

/**
 * Shared catch-block body for chunked endpoints. Maps SessionForbiddenError
 * to a 403 and forwards everything else to Express's error handler.
 */
function handleChunkedError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof SessionForbiddenError) {
    res.status(403).json({ error: "Upload session does not belong to you" });
    return;
  }
  next(error);
}

export function createUploadRouter(indexStore: IndexStore): Router {
  const router = Router();
  const maxUploadFiles = getMaxUploadFiles();
  const maxUploadBytes = getMaxUploadBytes();

  const upload = createAudioUpload(maxUploadBytes);
  const chunkUpload = createChunkUpload();

  router.post("/upload/chunked/init", requireAuth, async (req, res, next) => {
    try {
      const ownerId = requireOwnerId(req, res);
      if (!ownerId) return;

      const fileName = normalizeOptionalString(req.body?.fileName);
      const fileSize = Number(req.body?.fileSize);

      if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
        res.status(400).json({ error: "fileName and fileSize are required" });
        return;
      }

      if (fileSize > maxUploadBytes) {
        res.status(413).json({ error: `File exceeds maximum upload size of ${maxUploadBytes} bytes` });
        return;
      }

      if (!isSupportedAudioFile(fileName)) {
        res.status(400).json({ error: "Unsupported audio format" });
        return;
      }

      const session = await initChunkedUpload(ownerId, fileName, fileSize);
      res.json({
        sessionId: session.id,
        chunkSize: session.chunkSize,
        totalChunks: session.totalChunks
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/upload/chunked/chunk",
    requireAuth,
    chunkUpload.single("chunk"),
    async (req, res, next) => {
      try {
        const ownerId = requireOwnerId(req, res);
        if (!ownerId) return;

        const sessionId = requireSessionId(req, res);
        if (!sessionId) return;

        const chunkIndex = Number(req.body?.chunkIndex);
        if (!Number.isFinite(chunkIndex)) {
          res.status(400).json({ error: "chunkIndex is required" });
          return;
        }

        if (!req.file?.buffer) {
          res.status(400).json({ error: "Chunk data is required" });
          return;
        }

        const session = await saveChunk(sessionId, ownerId, chunkIndex, req.file.buffer);
        res.json({
          received: chunkIndex,
          progress: session.receivedChunks.size / session.totalChunks
        });
      } catch (error) {
        handleChunkedError(error, res, next);
      }
    }
  );

  router.post("/upload/chunked/complete", requireAuth, async (req, res, next) => {
    try {
      const ownerId = requireOwnerId(req, res);
      if (!ownerId) return;

      const sessionId = requireSessionId(req, res);
      if (!sessionId) return;

      const session = getOwnedSession(sessionId, ownerId);
      if (!session) {
        res.status(404).json({ error: "Upload session not found" });
        return;
      }

      const assembledPath = await assembleChunks(sessionId, ownerId);
      res.json({
        tempPath: assembledPath,
        fileName: session.fileName,
        size: session.totalSize
      });
    } catch (error) {
      handleChunkedError(error, res, next);
    }
  });

  router.post("/upload/chunked/cancel", requireAuth, async (req, res, next) => {
    try {
      const ownerId = requireOwnerId(req, res);
      if (!ownerId) return;

      const sessionId = requireSessionId(req, res);
      if (!sessionId) return;

      await cancelChunkedUpload(sessionId, ownerId);
      res.json({ cancelled: true });
    } catch (error) {
      handleChunkedError(error, res, next);
    }
  });

  router.get("/upload/chunk-size", requireAuth, (_req, res) => {
    res.json({ chunkSize: getChunkSize() });
  });

  router.post("/upload/finalize", requireAuth, upload.single("file"), async (req, res, next) => {
    const tempPath = normalizeOptionalString(req.body?.tempPath);
    const originalFileName = normalizeOptionalString(req.body?.fileName);
    let uploadedFile = req.file;
    const directTempPath = req.file?.path;

    try {
      if (tempPath && !uploadedFile) {
        const resolved = await resolveTempPathFile(tempPath, originalFileName, maxUploadBytes);
        if (!resolved.ok) {
          res.status(resolved.status).json({ error: resolved.error });
          return;
        }
        uploadedFile = resolved.file;
      }

      if (!uploadedFile) {
        res.status(400).json({ error: "A file is required" });
        return;
      }

      const ownerId = requireOwnerId(req, res);
      if (!ownerId) return;

      const parsedBody = parseUploadRequestBody(req.body);

      const result = await ingestUploadedFiles(indexStore, [uploadedFile], {
        ownerId,
        ...parsedBody
      });

      res.status(201).json({
        processed: result.processed,
        uploaded: result.uploaded,
        deduplicated: result.deduplicated,
        tracks: result.tracks,
        overrides: { artist: parsedBody.manualArtist, album: parsedBody.manualAlbum }
      });

      void checkStorageAndWarnAdmins();
    } catch (error) {
      if (directTempPath) {
        await cleanupTemporaryFiles([directTempPath]);
      }
      next(error);
    }
  });

  router.get("/recent-uploads", requireAuth, async (_req, res, next) => {
    try {
      const tracks = await readTrackActivityLog();
      res.json({ tracks });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/upload",
    requireAuth,
    upload.fields([
      { name: "files", maxCount: maxUploadFiles },
      { name: "file", maxCount: 1 }
    ]),
    async (req, res, next) => {
      const uploadedFiles = collectUploadedFiles(req.files);
      const tempFilePaths = uploadedFiles.map((file) => file.path);

      try {
        if (uploadedFiles.length === 0) {
          res.status(400).json({ error: "At least one file is required" });
          return;
        }

        const ownerId = requireOwnerId(req, res);
        if (!ownerId) return;

        const parsedBody = parseUploadRequestBody(req.body);

        const result = await ingestUploadedFiles(indexStore, uploadedFiles, {
          ownerId,
          ...parsedBody
        });

        res.status(201).json({
          processed: result.processed,
          uploaded: result.uploaded,
          deduplicated: result.deduplicated,
          tracks: result.tracks,
          deferredRebuild: result.deferredRebuild,
          overrides: {
            artist: parsedBody.manualArtist,
            album: parsedBody.manualAlbum
          }
        });
        void checkStorageAndWarnAdmins();
      } catch (error) {
        await cleanupTemporaryFiles(tempFilePaths);
        next(error);
      }
    }
  );

  return router;
}
