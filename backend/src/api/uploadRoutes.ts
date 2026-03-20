import fs from "node:fs/promises";
import path from "node:path";

import multer from "multer";
import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import { appendTrackActivityLogEntries, readTrackActivityLog } from "../services/activity/trackActivityStore";
import { mergeTrackMetadataOverrides } from "../services/indexer/metadataOverrideStore";
import { IndexStore } from "../services/indexer/indexStore";
import {
  ensureDirectoryMetadata,
  fetchAlbumCoverPath,
  fetchArtistPhotoPath,
  normalizeDirectorySegment,
  writeEmbeddedCoverToDirectory
} from "../services/media/mediaMetadataService";
import { extractAudioMetadata } from "../services/scanner/audioProbe";
import { ensureTrackCover } from "../services/storage/coverService";
import { ensureOwnerUploadDir, toDataRelativePath } from "../services/storage/storageService";
import type { Track } from "../types/library";
import { fileExists, moveFile, writeJsonAtomic } from "../utils/fs";
import { createTrackId, hashFile } from "../utils/hash";
import { getAudioMimeType, getSupportedAudioExtensions, isSupportedAudioFile } from "../utils/mime";
import { tmpUploadsRoot } from "../utils/paths";

const DEFAULT_MAX_UPLOAD_FILES = 50;
const UNKNOWN_ARTIST = "Unknown Artist";
const UNKNOWN_ALBUM = "Unknown Album";
const ARTIST_METADATA_FILE = "artist.json";
const ALBUM_METADATA_FILE = "album.json";
const ALBUM_COVER_BASE_NAME = "album-cover";

type ArtistMetadata = {
  name: string;
  photo?: {
    path: string;
  };
};

type AlbumMetadata = {
  name: string;
  cover?: {
    path: string;
  };
};

function sanitizeExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (!ext || !getSupportedAudioExtensions().includes(ext)) {
    return ".flac";
  }
  return ext;
}

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

type UploadMetadataOverride = {
  title?: string;
  artist?: string;
  album?: string;
};

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

        const ownerUploadDir = await ensureOwnerUploadDir(ownerId);
        const uploadedTrackIds: string[] = [];
        const newUploadTrackIds: string[] = [];
        const provisionalTrackById = new Map<string, Track>();
        const metadataOverridePatch: Record<string, { title?: string; artist?: string; album?: string }> = {};
        let deduplicated = 0;

        for (const [index, uploadedFile] of uploadedFiles.entries()) {
          if (!isSupportedAudioFile(uploadedFile.originalname)) {
            throw new Error(`Unsupported audio format: ${uploadedFile.originalname}`);
          }

          const metadata = await extractAudioMetadata(uploadedFile.path);
          const metadataOverride = metadataOverrides[index] ?? {};
          const pathArtistName =
            metadataOverride.artist ??
            manualArtist ??
            metadata.tags.artist ??
            metadata.tags.albumArtist ??
            metadata.tags.artists?.[0] ??
            UNKNOWN_ARTIST;
          const pathAlbumName = metadataOverride.album ?? manualAlbum ?? metadata.tags.album ?? UNKNOWN_ALBUM;

          const artistDirName = normalizeDirectorySegment(pathArtistName);
          const albumDirName = normalizeDirectorySegment(pathAlbumName);
          const artistDir = path.join(ownerUploadDir, artistDirName);
          const artistDirectoryState = await ensureDirectoryMetadata(
            artistDir,
            ARTIST_METADATA_FILE,
            pathArtistName
          );

          if (artistDirectoryState.createdDirectory) {
            const artistPhotoPath = await fetchArtistPhotoPath(pathArtistName, artistDir);
            if (artistPhotoPath) {
              const artistMetadata: ArtistMetadata = {
                name: pathArtistName,
                photo: {
                  path: artistPhotoPath
                }
              };
              await writeJsonAtomic(artistDirectoryState.metadataPath, artistMetadata);
            }
          }

          const albumDir = path.join(artistDir, albumDirName);
          const albumDirectoryState = await ensureDirectoryMetadata(albumDir, ALBUM_METADATA_FILE, pathAlbumName);

          if (albumDirectoryState.createdDirectory) {
            const embeddedCoverPath = await writeEmbeddedCoverToDirectory(
              metadata.cover,
              albumDir,
              ALBUM_COVER_BASE_NAME
            );
            const albumCoverPath =
              embeddedCoverPath ?? (await fetchAlbumCoverPath(pathArtistName, pathAlbumName, albumDir));
            if (albumCoverPath) {
              const albumMetadata: AlbumMetadata = {
                name: pathAlbumName,
                cover: {
                  path: albumCoverPath
                }
              };
              await writeJsonAtomic(albumDirectoryState.metadataPath, albumMetadata);
            }
          }

          const hash = await hashFile(uploadedFile.path);
          const extension = sanitizeExtension(uploadedFile.originalname);
          const finalFileName = `${hash}${extension}`;
          const finalPath = path.join(albumDir, finalFileName);
          const relativePath = toDataRelativePath(finalPath);
          const trackId = createTrackId(ownerId, relativePath);

          const effectiveTitle = metadataOverride.title;
          const effectiveArtist = metadataOverride.artist ?? manualArtist;
          const effectiveAlbum = metadataOverride.album ?? manualAlbum;

          const tags = {
            ...metadata.tags,
            ...(effectiveTitle ? { title: effectiveTitle } : {}),
            ...(effectiveArtist ? { artist: effectiveArtist } : {}),
            ...(effectiveAlbum ? { album: effectiveAlbum } : {})
          };

          const alreadyPresent = await fileExists(finalPath);
          if (alreadyPresent) {
            deduplicated += 1;
            await fs.unlink(uploadedFile.path);
          } else {
            await moveFile(uploadedFile.path, finalPath);
            newUploadTrackIds.push(trackId);
          }
          const cover = await ensureTrackCover(trackId, metadata.cover);

          provisionalTrackById.set(trackId, {
            id: trackId,
            owner: ownerId,
            path: relativePath,
            duration: metadata.duration,
            mimeType: getAudioMimeType(uploadedFile.originalname),
            codec: metadata.codec,
            bitrate: metadata.bitrate,
            sampleRate: metadata.sampleRate,
            tags,
            cover
          });

          uploadedTrackIds.push(trackId);

          if (effectiveTitle || effectiveArtist || effectiveAlbum) {
            metadataOverridePatch[trackId] = {
              title: effectiveTitle,
              artist: effectiveArtist,
              album: effectiveAlbum
            };
          }
        }

        if (Object.keys(metadataOverridePatch).length > 0) {
          await mergeTrackMetadataOverrides(metadataOverridePatch);
        }

        const updatedIndex = deferRebuild ? indexStore.getSnapshot() : await indexStore.rebuild();
        const tracks = uploadedTrackIds
          .map(
            (trackId) =>
              updatedIndex.tracks.find((candidate) => candidate.id === trackId) ?? provisionalTrackById.get(trackId)
          )
          .filter((track): track is Track => Boolean(track));
        const newUploadTracks = newUploadTrackIds
          .map(
            (trackId) =>
              updatedIndex.tracks.find((candidate) => candidate.id === trackId) ?? provisionalTrackById.get(trackId)
          )
          .filter((track): track is Track => Boolean(track));

        await appendTrackActivityLogEntries(newUploadTracks);

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
