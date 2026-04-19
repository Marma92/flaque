import path from "node:path";

import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import type { IndexStore } from "../services/indexer/indexStore";
import { findCoverFileByTrackId } from "../services/storage/coverService";
import { AppError } from "../utils/AppError";
import { fileExists, readJsonFile } from "../utils/fs";
import { createLogger } from "../utils/logger";
import { ALBUM_METADATA_FILE } from "../utils/music";
import { resolveDataRelativePath } from "../utils/paths";

const log = createLogger("covers");
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

type AlbumMetadata = {
  cover?: {
    path: string;
  };
};

async function resolveAlbumCoverByTrackId(indexStore: IndexStore, trackId: string): Promise<string | null> {
  const track = indexStore.getTrackById(trackId);
  if (!track) {
    return null;
  }

  const trackAbsolutePath = resolveDataRelativePath(track.path);
  const albumDir = path.dirname(trackAbsolutePath);
  const metadataPath = path.join(albumDir, ALBUM_METADATA_FILE);
  const metadata = await readJsonFile<AlbumMetadata | null>(metadataPath, null);
  const relativeCoverPath = metadata?.cover?.path;
  if (!relativeCoverPath) {
    return null;
  }

  const absoluteCoverPath = resolveDataRelativePath(relativeCoverPath);
  const hasCover = await fileExists(absoluteCoverPath);
  return hasCover ? absoluteCoverPath : null;
}

export function createCoverRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.get("/covers/from-path", requireAuth, async (req, res, next) => {
    try {
      const relativePath = typeof req.query.path === "string" ? req.query.path.trim() : "";
      if (!relativePath) {
        return next(new AppError("path query parameter is required", 400));
      }

      const extension = path.extname(relativePath).toLowerCase();
      if (!ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
        return next(new AppError("Unsupported image path", 400));
      }

      const absolutePath = resolveDataRelativePath(relativePath);
      const hasFile = await fileExists(absolutePath);
      if (!hasFile) {
        log.warn("Cover not found for path", { path: relativePath });
        return next(new AppError("Cover not found", 404));
      }

      res.setHeader("Cache-Control", "private, max-age=86400");
      res.sendFile(absolutePath);
    } catch (error) {
      next(error);
    }
  });

  router.get("/covers/:id", requireAuth, async (req, res, next) => {
    try {
      const trackId = req.params.id;
      if (!trackId) {
        return next(new AppError("Track id is required", 400));
      }

      const coverPath = (await resolveAlbumCoverByTrackId(indexStore, trackId)) ?? (await findCoverFileByTrackId(trackId));
      if (!coverPath) {
        log.warn("Cover not found for track", { trackId });
        return next(new AppError("Cover not found", 404));
      }

      res.setHeader("Cache-Control", "private, max-age=86400");
      res.sendFile(coverPath);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
