import path from "node:path";

import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import type { IndexStore } from "../services/indexer/indexStore";
import { findCoverFileByTrackId } from "../services/storage/coverService";
import { fileExists, readJsonFile } from "../utils/fs";
import { resolveDataRelativePath } from "../utils/paths";

const ALBUM_METADATA_FILE = "album.json";

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

  router.get("/covers/:id", requireAuth, async (req, res, next) => {
    try {
      const trackId = req.params.id;
      if (!trackId) {
        res.status(400).json({ error: "Track id is required" });
        return;
      }

      const coverPath = (await resolveAlbumCoverByTrackId(indexStore, trackId)) ?? (await findCoverFileByTrackId(trackId));
      if (!coverPath) {
        res.status(404).json({ error: "Cover not found" });
        return;
      }

      res.setHeader("Cache-Control", "private, max-age=86400");
      res.sendFile(coverPath);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
