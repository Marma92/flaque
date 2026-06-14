import { Router, type NextFunction, type Response } from "express";

import { requireAuth } from "../../auth/middleware";
import {
  initChunkedUpload,
  getOwnedSession,
  saveChunk,
  assembleChunks,
  cancelChunkedUpload,
  getChunkSize,
  SessionForbiddenError
} from "../../services/upload/chunkedUploadService";
import { AppError } from "../../utils/AppError";
import { isSupportedAudioFile } from "../../utils/mime";
import { normalizeOptionalString } from "../../utils/validation";
import { createChunkUpload, getMaxUploadBytes } from "./multer";
import { requireOwnerId, requireSessionId } from "./parsers";

/**
 * Shared catch-block body for chunked endpoints. Maps SessionForbiddenError
 * to a 403 and forwards everything else to Express's error handler.
 */
function handleChunkedError(error: unknown, _res: Response, next: NextFunction): void {
  if (error instanceof SessionForbiddenError) {
    return next(new AppError("Upload session does not belong to you", 403, "uploadSessionDoesBelong"));
  }
  next(error);
}

export function createChunkedUploadRouter(): Router {
  const router = Router();
  const maxUploadBytes = getMaxUploadBytes();
  const chunkUpload = createChunkUpload();

  router.post("/upload/chunked/init", requireAuth, async (req, res, next) => {
    try {
      const ownerId = requireOwnerId(req);

      const fileName = normalizeOptionalString(req.body?.fileName);
      const fileSize = Number(req.body?.fileSize);

      if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
        return next(new AppError("fileName and fileSize are required", 400, "filenameFilesize"));
      }

      if (fileSize > maxUploadBytes) {
        return next(new AppError(`File exceeds maximum upload size of ${maxUploadBytes} bytes`, 413));
      }

      if (!isSupportedAudioFile(fileName)) {
        return next(new AppError("Unsupported audio format", 400, "unsupportedAudioFormat"));
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
        const ownerId = requireOwnerId(req);
        const sessionId = requireSessionId(req);

        const chunkIndex = Number(req.body?.chunkIndex);
        if (!Number.isFinite(chunkIndex)) {
          return next(new AppError("chunkIndex is required", 400, "chunkindex"));
        }

        if (!req.file?.buffer) {
          return next(new AppError("Chunk data is required", 400, "chunkData"));
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
      const ownerId = requireOwnerId(req);
      const sessionId = requireSessionId(req);

      const session = getOwnedSession(sessionId, ownerId);
      if (!session) {
        return next(new AppError("Upload session not found", 404, "uploadSessionFound"));
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
      const ownerId = requireOwnerId(req);
      const sessionId = requireSessionId(req);

      await cancelChunkedUpload(sessionId, ownerId);
      res.json({ cancelled: true });
    } catch (error) {
      handleChunkedError(error, res, next);
    }
  });

  router.get("/upload/chunk-size", requireAuth, (_req, res) => {
    res.json({ chunkSize: getChunkSize() });
  });

  return router;
}
