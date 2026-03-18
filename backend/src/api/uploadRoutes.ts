import fs from "node:fs/promises";
import path from "node:path";

import multer from "multer";
import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { IndexStore } from "../services/indexer/indexStore";
import { extractAudioMetadata } from "../services/scanner/audioProbe";
import { ensureTrackCover } from "../services/storage/coverService";
import { ensureOwnerUploadDir, toDataRelativePath } from "../services/storage/storageService";
import { fileExists } from "../utils/fs";
import { createTrackId, hashFile } from "../utils/hash";
import { getSupportedAudioExtensions, isSupportedAudioFile } from "../utils/mime";
import { tmpUploadsRoot } from "../utils/paths";

function sanitizeExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (!ext || !getSupportedAudioExtensions().includes(ext)) {
    return ".flac";
  }
  return ext;
}

export function createUploadRouter(indexStore: IndexStore): Router {
  const router = Router();

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        callback(null, tmpUploadsRoot);
      },
      filename: (_req, file, callback) => {
        callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${sanitizeExtension(file.originalname)}`);
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

  router.post("/upload", requireAuth, upload.single("file"), async (req, res, next) => {
    const uploadedPath = req.file?.path;

    try {
      if (!req.file || !uploadedPath) {
        res.status(400).json({ error: "File is required" });
        return;
      }

      if (!isSupportedAudioFile(req.file.originalname)) {
        res.status(400).json({ error: "Unsupported audio format" });
        return;
      }

      const ownerId = req.authUser?.id;
      if (!ownerId) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const metadata = await extractAudioMetadata(uploadedPath);
      const hash = await hashFile(uploadedPath);
      const extension = sanitizeExtension(req.file.originalname);

      const ownerUploadDir = await ensureOwnerUploadDir(ownerId);
      const finalFileName = `${hash}${extension}`;
      const finalPath = path.join(ownerUploadDir, finalFileName);

      const alreadyPresent = await fileExists(finalPath);
      if (alreadyPresent) {
        await fs.unlink(uploadedPath);
      } else {
        await fs.rename(uploadedPath, finalPath);
      }

      const relativePath = toDataRelativePath(finalPath);
      const trackId = createTrackId(ownerId, relativePath);
      await ensureTrackCover(trackId, metadata.cover);

      const updatedIndex = await indexStore.rebuild();
      const track = updatedIndex.tracks.find((candidate) => candidate.id === trackId);

      res.status(201).json({
        track,
        deduplicated: alreadyPresent
      });
    } catch (error) {
      if (uploadedPath && (await fileExists(uploadedPath))) {
        await fs.unlink(uploadedPath);
      }
      next(error);
    }
  });

  return router;
}
