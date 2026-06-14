import path from "node:path";

import multer from "multer";

import { sanitizeExtension } from "../../services/upload/uploadService";
import { getChunkSize } from "../../services/upload/chunkedUploadService";
import { AppError } from "../../utils/AppError";
import { getSupportedAudioExtensions } from "../../utils/mime";
import { tmpUploadsRoot } from "../../utils/paths";

const DEFAULT_MAX_UPLOAD_FILES = 50;
const DEFAULT_MAX_UPLOAD_BYTES = 2_147_483_648;

export function getMaxUploadBytes(): number {
  const raw = Number(process.env.MAX_UPLOAD_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_UPLOAD_BYTES;
}

export function getMaxUploadFiles(): number {
  const raw = Number(process.env.MAX_UPLOAD_FILES ?? DEFAULT_MAX_UPLOAD_FILES);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_UPLOAD_FILES;
}

export function isPathInside(candidate: string, parent: string): boolean {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedParent = path.resolve(parent);
  if (resolvedCandidate === resolvedParent) {
    return false;
  }
  const withSep = resolvedParent.endsWith(path.sep) ? resolvedParent : resolvedParent + path.sep;
  return resolvedCandidate.startsWith(withSep);
}

export function createAudioUpload(maxUploadBytes: number): multer.Multer {
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
      callback(new AppError("Unsupported audio format", 400, "unsupportedAudioFormat"));
    }
  });
}

// Chunks are raw binary blobs from File.slice() with no audio extension; they
// need memory storage (so req.file.buffer is populated) and no audio-extension
// filter. The per-chunk cap is CHUNK_SIZE plus a small overhead for multipart
// framing.
export function createChunkUpload(): multer.Multer {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: getChunkSize() + 1024 * 1024
    }
  });
}
