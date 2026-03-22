import path from "node:path";

import multer from "multer";
import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { appendTrackActivityLogEntries, readTrackActivityLog } from "../services/activity/trackActivityStore";
import { mergeTrackMetadataOverrides } from "../services/indexer/metadataOverrideStore";
import { IndexStore } from "../services/indexer/indexStore";
import { extractAudioMetadata } from "../services/scanner/audioProbe";
import { processUploadedFile, sanitizeExtension, type UploadMetadataOverride } from "../services/upload/uploadService";
import type { Track } from "../types/library";
import { fileExists } from "../utils/fs";
import { getAudioMimeType, getSupportedAudioExtensions, isSupportedAudioFile } from "../utils/mime";
import { tmpUploadsRoot } from "../utils/paths";
import { ensureSharedMusicDir } from "../services/storage/storageService";
import fs from "node:fs/promises";

const DEFAULT_MAX_UPLOAD_FILES = 50;

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseBooleanFormField(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseUploadMetadataOverrides(value: unknown): UploadMetadataOverride[] {
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

function collectUploadedFiles(files: unknown): Express.Multer.File[] {
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
        const deferRebuild = parseBooleanFormField(req.body?.deferRebuild);
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
      } catch (error) {
        await cleanupTemporaryFiles(tempFilePaths);
        next(error);
      }
    }
  );

  return router;
}
