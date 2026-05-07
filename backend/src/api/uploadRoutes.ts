import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { IndexStore } from "../services/indexer/indexStore";
import { checkStorageAndWarnAdmins } from "../services/storage/storageWarningService";
import { AppError } from "../utils/AppError";
import { normalizeOptionalString } from "../utils/validation";
import { createChunkedUploadRouter } from "./upload/chunked";
import {
  cleanupTemporaryFiles,
  ingestUploadedFiles,
  resolveTempPathFile
} from "./upload/ingest";
import {
  createAudioUpload,
  getMaxUploadBytes,
  getMaxUploadFiles
} from "./upload/multer";
import {
  collectUploadedFiles,
  parseUploadRequestBody,
  requireOwnerId
} from "./upload/parsers";

// Re-exported for use by uploadService tests, which depend on these helpers
// living on the route module.
export { collectUploadedFiles, parseUploadMetadataOverrides } from "./upload/parsers";

export function createUploadRouter(indexStore: IndexStore): Router {
  const router = Router();
  const maxUploadFiles = getMaxUploadFiles();
  const maxUploadBytes = getMaxUploadBytes();

  const upload = createAudioUpload(maxUploadBytes);

  router.use(createChunkedUploadRouter());

  router.post("/upload/finalize", requireAuth, upload.single("file"), async (req, res, next) => {
    const tempPath = normalizeOptionalString(req.body?.tempPath);
    const originalFileName = normalizeOptionalString(req.body?.fileName);
    let uploadedFile = req.file;
    const directTempPath = req.file?.path;

    try {
      if (tempPath && !uploadedFile) {
        const resolved = await resolveTempPathFile(tempPath, originalFileName, maxUploadBytes);
        if (!resolved.ok) {
          return next(new AppError(resolved.error, resolved.status));
        }
        uploadedFile = resolved.file;
      }

      if (!uploadedFile) {
        return next(new AppError("A file is required", 400));
      }

      const ownerId = requireOwnerId(req);

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
          return next(new AppError("At least one file is required", 400));
        }

        const ownerId = requireOwnerId(req);

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
