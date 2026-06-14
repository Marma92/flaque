import type { UploadMetadataOverride } from "../../services/upload/uploadService";
import { AppError } from "../../utils/AppError";
import { normalizeOptionalString, parseBooleanField } from "../../utils/validation";

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

      let genre: string[] | undefined;
      const rawGenre = (entry as { genre?: unknown }).genre;
      if (Array.isArray(rawGenre)) {
        const parsed = rawGenre
          .filter((g): g is string => typeof g === "string")
          .map((g) => g.trim())
          .filter(Boolean);
        if (parsed.length > 0) genre = parsed;
      }

      return {
        title: normalizeOptionalString((entry as { title?: unknown }).title),
        artist: normalizeOptionalString((entry as { artist?: unknown }).artist),
        album: normalizeOptionalString((entry as { album?: unknown }).album),
        year,
        genre
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

export function requireOwnerId(req: { authUser?: { id?: string } }): string {
  const ownerId = req.authUser?.id;
  if (!ownerId) {
    throw new AppError("Authentication required", 401, "authentication");
  }
  return ownerId;
}

export function requireSessionId(req: { body?: Record<string, unknown> }): string {
  const sessionId = normalizeOptionalString(req.body?.sessionId);
  if (!sessionId) {
    throw new AppError("sessionId is required", 400, "sessionid");
  }
  return sessionId;
}

export type ParsedUploadRequestBody = {
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

export function parseUploadRequestBody(body: unknown): ParsedUploadRequestBody {
  const source = (body ?? {}) as Record<string, unknown>;
  return {
    manualArtist: normalizeOptionalString(source.artist),
    manualAlbum: normalizeOptionalString(source.album),
    manualYear: parseManualYear(source.year),
    deferRebuild: parseBooleanField(source.deferRebuild),
    metadataOverrides: parseUploadMetadataOverrides(source.metadataOverrides)
  };
}
