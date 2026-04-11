import path from "node:path";

import multer from "multer";
import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { appendTrackActivityLogEntries, readTrackActivityLog } from "../services/activity/trackActivityStore";
import { mergeTrackMetadataOverrides } from "../services/indexer/metadataOverrideStore";
import { IndexStore } from "../services/indexer/indexStore";
import { extractAudioMetadata } from "../services/scanner/audioProbe";
import { processUploadedFile, sanitizeExtension, type UploadMetadataOverride } from "../services/upload/uploadService";
import {
  initChunkedUpload,
  getSession,
  saveChunk,
  assembleChunks,
  cancelChunkedUpload,
  getChunkSize
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
import fs from "node:fs/promises";

const DEFAULT_MAX_UPLOAD_FILES = 50;

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

      return {
        title: normalizeOptionalString((entry as { title?: unknown }).title),
        artist: normalizeOptionalString((entry as { artist?: unknown }).artist),
        album: normalizeOptionalString((entry as { album?: unknown }).album)
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

function toCoverDataUrl(cover?: { data: Buffer; format?: string }): string | undefined {
  if (!cover || !cover.data) {
    return undefined;
  }

  const mimeType =
    typeof cover.format === "string" && cover.format.trim() ? cover.format.trim() : "image/jpeg";
  return `data:${mimeType};base64,${cover.data.toString("base64")}`;
}

export function createUploadRouter(indexStore: IndexStore): Router {
  const router = Router();
  const maxUploadFiles = Number(process.env.MAX_UPLOAD_FILES ?? DEFAULT_MAX_UPLOAD_FILES);
  const uploadFileCap =
    Number.isInteger(maxUploadFiles) && maxUploadFiles > 0 ? maxUploadFiles : DEFAULT_MAX_UPLOAD_FILES;

  const upload = multer({
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
      fileSize: Number(process.env.MAX_UPLOAD_BYTES ?? 2_147_483_648)
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

  router.post("/upload/chunked/init", requireAuth, async (req, res, next) => {
    try {
      const fileName = normalizeOptionalString(req.body?.fileName);
      const fileSize = Number(req.body?.fileSize);

      if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
        res.status(400).json({ error: "fileName and fileSize are required" });
        return;
      }

      if (!isSupportedAudioFile(fileName)) {
        res.status(400).json({ error: "Unsupported audio format" });
        return;
      }

      const session = initChunkedUpload(fileName, fileSize);
      res.json({
        sessionId: session.id,
        chunkSize: session.chunkSize,
        totalChunks: session.totalChunks
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/upload/chunked/chunk", requireAuth, upload.single("chunk"), async (req, res, next) => {
    try {
      const sessionId = normalizeOptionalString(req.body?.sessionId);
      const chunkIndex = Number(req.body?.chunkIndex);

      if (!sessionId || !Number.isFinite(chunkIndex)) {
        res.status(400).json({ error: "sessionId and chunkIndex are required" });
        return;
      }

      const session = getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: "Upload session not found" });
        return;
      }

      if (!req.file?.buffer) {
        res.status(400).json({ error: "Chunk data is required" });
        return;
      }

      await saveChunk(sessionId, chunkIndex, req.file.buffer);
      res.json({ received: chunkIndex, progress: session.receivedChunks.size / session.totalChunks });
    } catch (error) {
      next(error);
    }
  });

  router.post("/upload/chunked/complete", requireAuth, async (req, res, next) => {
    try {
      const sessionId = normalizeOptionalString(req.body?.sessionId);

      if (!sessionId) {
        res.status(400).json({ error: "sessionId is required" });
        return;
      }

      const session = getSession(sessionId);
      if (!session) {
        res.status(404).json({ error: "Upload session not found" });
        return;
      }

      const assembledPath = await assembleChunks(sessionId);
      res.json({ tempPath: assembledPath, fileName: session.fileName, size: session.totalSize });
    } catch (error) {
      next(error);
    }
  });

  router.post("/upload/chunked/cancel", requireAuth, async (req, res, next) => {
    try {
      const sessionId = normalizeOptionalString(req.body?.sessionId);

      if (!sessionId) {
        res.status(400).json({ error: "sessionId is required" });
        return;
      }

      await cancelChunkedUpload(sessionId);
      res.json({ cancelled: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/upload/chunk-size", requireAuth, (_req, res) => {
    res.json({ chunkSize: getChunkSize() });
  });

  router.post("/upload/finalize", requireAuth, upload.single("file"), async (req, res, next) => {
    const tempPath = normalizeOptionalString(req.body?.tempPath);
    let uploadedFile = req.file;

    try {
      if (tempPath && !uploadedFile) {
        const exists = await fileExists(tempPath);
        if (exists) {
          const stat = await fs.stat(tempPath);
          uploadedFile = {
            path: tempPath,
            originalname: path.basename(tempPath),
            size: stat.size,
            mimetype: "audio/flac"
          } as Express.Multer.File;
        }
      }

      if (!uploadedFile) {
        res.status(400).json({ error: "A file is required" });
        return;
      }

      const ownerId = req.authUser?.id;
      if (!ownerId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const manualArtist = normalizeOptionalString(req.body?.artist);
      const manualAlbum = normalizeOptionalString(req.body?.album);
      const deferRebuild = parseBooleanField(req.body?.deferRebuild);
      const metadataOverrides = parseUploadMetadataOverrides(req.body?.metadataOverrides);

      const musicDir = await ensureSharedMusicDir();
      const result = await processUploadedFile(
        uploadedFile,
        ownerId,
        musicDir,
        manualArtist,
        manualAlbum,
        metadataOverrides[0] ?? {}
      );

      if (metadataOverrides[0]) {
        await mergeTrackMetadataOverrides({ [result.trackId]: metadataOverrides[0] });
      }

      const updatedIndex = deferRebuild ? indexStore.getSnapshot() : await indexStore.rebuild();
      const track =
        updatedIndex.tracks.find((t) => t.id === result.trackId) ??
        (result.track as Track);

      if (result.isNew) {
        await appendTrackActivityLogEntries([track]);
      }

      log.info("Chunked upload complete", {
        owner: ownerId,
        trackId: result.trackId,
        isNew: result.isNew
      });

      res.status(201).json({
        processed: 1,
        uploaded: result.isNew ? 1 : 0,
        deduplicated: result.isNew ? 0 : 1,
        tracks: [track],
        overrides: { artist: manualArtist, album: manualAlbum }
      });

      void checkStorageAndWarnAdmins();
    } catch (error) {
      next(error);
    }
  });

  router.post("/upload/inspect", requireAuth, upload.single("file"), async (req, res, next) => {
    const temporaryPath = req.file?.path;

    try {
      const uploadedFile = req.file;
      if (!uploadedFile) {
        res.status(400).json({ error: "A file is required" });
        return;
      }

      if (!isSupportedAudioFile(uploadedFile.originalname)) {
        res.status(400).json({ error: `Unsupported audio format: ${uploadedFile.originalname}` });
        return;
      }

      const metadata = await extractAudioMetadata(uploadedFile.path);
      res.json({
        fileName: uploadedFile.originalname,
        size: uploadedFile.size,
        mimeType: getAudioMimeType(uploadedFile.originalname),
        duration: metadata.duration,
        codec: metadata.codec,
        bitrate: metadata.bitrate,
        sampleRate: metadata.sampleRate,
        tags: metadata.tags,
        coverDataUrl: toCoverDataUrl(metadata.cover)
      });
    } catch (error) {
      next(error);
    } finally {
      if (temporaryPath) {
        await cleanupTemporaryFiles([temporaryPath]);
      }
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
      { name: "files", maxCount: uploadFileCap },
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

        const ownerId = req.authUser?.id;
        if (!ownerId) {
          res.status(401).json({ error: "Authentication required" });
          return;
        }

        const manualArtist = normalizeOptionalString(req.body?.artist);
        const manualAlbum = normalizeOptionalString(req.body?.album);
        const deferRebuild = parseBooleanField(req.body?.deferRebuild);
        const metadataOverrides = parseUploadMetadataOverrides(req.body?.metadataOverrides);

        const musicDir = await ensureSharedMusicDir();
        const results: Awaited<ReturnType<typeof processUploadedFile>>[] = [];

        for (const [index, uploadedFile] of uploadedFiles.entries()) {
          results.push(
            await processUploadedFile(
              uploadedFile,
              ownerId,
              musicDir,
              manualArtist,
              manualAlbum,
              metadataOverrides[index] ?? {}
            )
          );
        }

        const metadataOverridePatch: Record<string, { title?: string; artist?: string; album?: string }> = {};
        for (const result of results) {
          if (result.overrides) {
            metadataOverridePatch[result.trackId] = result.overrides;
          }
        }

        if (Object.keys(metadataOverridePatch).length > 0) {
          await mergeTrackMetadataOverrides(metadataOverridePatch);
        }

        const updatedIndex = deferRebuild ? indexStore.getSnapshot() : await indexStore.rebuild();
        const provisionalById = new Map(results.map((r) => [r.trackId, r.track]));

        const tracks = results
          .map(
            (result) =>
              updatedIndex.tracks.find((candidate) => candidate.id === result.trackId) ??
              provisionalById.get(result.trackId)
          )
          .filter((track): track is Track => Boolean(track));

        const newUploadTracks = results
          .filter((result) => result.isNew)
          .map(
            (result) =>
              updatedIndex.tracks.find((candidate) => candidate.id === result.trackId) ??
              provisionalById.get(result.trackId)
          )
          .filter((track): track is Track => Boolean(track));

        await appendTrackActivityLogEntries(newUploadTracks);

        const deduplicated = results.filter((r) => !r.isNew).length;
        log.info("Upload complete", {
          owner: ownerId,
          processed: uploadedFiles.length,
          uploaded: uploadedFiles.length - deduplicated,
          deduplicated
        });
        res.status(201).json({
          processed: uploadedFiles.length,
          uploaded: uploadedFiles.length - deduplicated,
          deduplicated,
          tracks,
          deferredRebuild: deferRebuild,
          overrides: {
            artist: manualArtist,
            album: manualAlbum
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
