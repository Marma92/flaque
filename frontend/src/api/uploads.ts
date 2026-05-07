import type { Track, TrackTags } from "../types";
import { ApiError, requestJson, withApiBase } from "./client";

export type UploadTracksInput = {
  files: File[];
  artist?: string;
  album?: string;
  year?: number;
  metadataOverrides?: Array<{
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    genre?: string[];
  } | null>;
  onProgress?: (input: { loaded: number; total: number; percent: number }) => void;
};

export type UploadTracksResult = {
  processed: number;
  uploaded: number;
  deduplicated: number;
  tracks: Track[];
  overrides?: {
    artist?: string;
    album?: string;
  };
};

export type UploadTrackPreview = {
  fileName: string;
  size: number;
  mimeType: string;
  duration: number;
  codec: string;
  bitrate?: number;
  sampleRate?: number;
  tags: TrackTags;
  coverDataUrl?: string;
};

type UploadSingleTrackInput = {
  file: File;
  artist?: string;
  album?: string;
  year?: number;
  deferRebuild?: boolean;
  metadataOverride?: {
    title?: string;
    artist?: string;
    album?: string;
    year?: number;
    genre?: string[];
  } | null;
  onProgress?: (input: { loaded: number; total: number; percent: number }) => void;
};

// Threshold for switching to chunked upload. Must match the backend's
// CHUNK_SIZE so files at or below this size fit in a single request under
// common 100 MB proxy limits. The actual chunk size for a given session is
// still taken from the backend's /init response.
const CHUNKED_UPLOAD_THRESHOLD = 99 * 1024 * 1024;

type ChunkedUploadSession = {
  sessionId: string;
  chunkSize: number;
  totalChunks: number;
};

async function initChunkedUpload(fileName: string, fileSize: number): Promise<ChunkedUploadSession> {
  return requestJson<ChunkedUploadSession>("/api/upload/chunked/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, fileSize })
  });
}

async function uploadChunk(sessionId: string, chunkIndex: number, chunk: Blob): Promise<void> {
  const formData = new FormData();
  formData.append("sessionId", sessionId);
  formData.append("chunkIndex", String(chunkIndex));
  formData.append("chunk", chunk);

  await requestJson<{ received: number }>("/api/upload/chunked/chunk", {
    method: "POST",
    body: formData
  });
}

async function completeChunkedUpload(sessionId: string): Promise<{ tempPath: string; fileName: string; size: number }> {
  return requestJson<{ tempPath: string; fileName: string; size: number }>("/api/upload/chunked/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId })
  });
}

async function cancelChunkedUpload(sessionId: string): Promise<void> {
  await requestJson("/api/upload/chunked/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId })
  });
}

async function uploadChunked(
  file: File,
  onProgress?: (input: { loaded: number; total: number; percent: number }) => void
): Promise<{ tempPath: string }> {
  const { sessionId, chunkSize, totalChunks } = await initChunkedUpload(file.name, file.size);
  let uploadedBytes = 0;

  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      await uploadChunk(sessionId, i, chunk);
      uploadedBytes += chunk.size;

      if (onProgress) {
        onProgress({
          loaded: uploadedBytes,
          total: file.size,
          percent: Math.round((uploadedBytes / file.size) * 100)
        });
      }
    }

    const result = await completeChunkedUpload(sessionId);
    return { tempPath: result.tempPath };
  } catch (error) {
    await cancelChunkedUpload(sessionId).catch(() => {});
    throw error;
  }
}

async function uploadSingleTrack(input: UploadSingleTrackInput): Promise<UploadTracksResult> {
  if (input.file.size > CHUNKED_UPLOAD_THRESHOLD) {
    return uploadSingleTrackChunked(input);
  }
  return uploadSingleTrackDirect(input);
}

async function uploadSingleTrackChunked(input: UploadSingleTrackInput): Promise<UploadTracksResult> {
  const { tempPath } = await uploadChunked(input.file, input.onProgress);
  return finalizeChunkedUpload(tempPath, input.file.name, input);
}

async function finalizeChunkedUpload(
  tempPath: string,
  fileName: string,
  input: Pick<UploadSingleTrackInput, "artist" | "album" | "year" | "deferRebuild" | "metadataOverride">
): Promise<UploadTracksResult> {
  const formData = new FormData();
  formData.append("tempPath", tempPath);
  formData.append("fileName", fileName);

  if (input.artist?.trim()) {
    formData.append("artist", input.artist.trim());
  }

  if (input.album?.trim()) {
    formData.append("album", input.album.trim());
  }

  if (input.year !== undefined) {
    formData.append("year", String(input.year));
  }

  if (input.metadataOverride) {
    formData.append("metadataOverrides", JSON.stringify([input.metadataOverride]));
  }

  if (input.deferRebuild) {
    formData.append("deferRebuild", "1");
  }

  return new Promise<UploadTracksResult>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", withApiBase("/api/upload/finalize"), true);
    request.withCredentials = true;
    request.responseType = "json";

    request.onload = () => {
      const payload = request.response as { error?: string } | UploadTracksResult | null;
      if (request.status >= 200 && request.status < 300 && payload) {
        resolve(payload as UploadTracksResult);
        return;
      }

      const message =
        (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : null) ?? `Request failed (${request.status})`;

      reject(new ApiError(request.status, "/api/upload/finalize", message));
    };

    request.onerror = () => {
      reject(new Error("Upload failed due to a network error"));
    };

    request.send(formData);
  });
}

function uploadSingleTrackDirect(input: UploadSingleTrackInput): Promise<UploadTracksResult> {
  const formData = new FormData();
  formData.append("file", input.file);

  if (input.artist?.trim()) {
    formData.append("artist", input.artist.trim());
  }

  if (input.album?.trim()) {
    formData.append("album", input.album.trim());
  }

  if (input.year !== undefined) {
    formData.append("year", String(input.year));
  }

  if (input.metadataOverride) {
    formData.append("metadataOverrides", JSON.stringify([input.metadataOverride]));
  }

  if (input.deferRebuild) {
    formData.append("deferRebuild", "1");
  }

  return new Promise<UploadTracksResult>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", withApiBase("/api/upload"));
    request.withCredentials = true;
    request.responseType = "json";

    request.upload.onprogress = (event) => {
      if (!input.onProgress || !event.lengthComputable) {
        return;
      }

      const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      input.onProgress({
        loaded: event.loaded,
        total: event.total,
        percent
      });
    };

    request.onload = () => {
      const payload = request.response as { error?: string } | UploadTracksResult | null;
      if (request.status >= 200 && request.status < 300 && payload) {
        resolve(payload as UploadTracksResult);
        return;
      }

      const message =
        (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : null) ?? `Request failed (${request.status})`;

      reject(new ApiError(request.status, "/api/upload", message));
    };

    request.onerror = () => {
      reject(new Error("Upload failed due to a network error"));
    };

    request.send(formData);
  });
}

export async function uploadTracks(input: UploadTracksInput): Promise<UploadTracksResult> {
  const files = input.files;
  if (files.length === 0) {
    throw new Error("At least one file is required");
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  let completedBytes = 0;

  const aggregate: UploadTracksResult = {
    processed: 0,
    uploaded: 0,
    deduplicated: 0,
    tracks: [],
    overrides: {
      artist: input.artist?.trim() || undefined,
      album: input.album?.trim() || undefined
    }
  };

  const aggregatedTrackById = new Map<string, Track>();

  for (const [index, file] of files.entries()) {
    const metadataOverride = input.metadataOverrides?.[index] ?? null;
    const isLastFile = index === files.length - 1;

    const singleResult = await uploadSingleTrack({
      file,
      artist: input.artist,
      album: input.album,
      year: input.year,
      deferRebuild: !isLastFile,
      metadataOverride,
      onProgress: input.onProgress
        ? (progress) => {
            const loaded = Math.min(completedBytes + progress.loaded, totalBytes);
            const percent =
              totalBytes > 0 ? Math.max(0, Math.min(100, Math.round((loaded / totalBytes) * 100))) : progress.percent;

            input.onProgress?.({
              loaded,
              total: totalBytes,
              percent
            });
          }
        : undefined
    });

    completedBytes += file.size;

    aggregate.processed += singleResult.processed;
    aggregate.uploaded += singleResult.uploaded;
    aggregate.deduplicated += singleResult.deduplicated;
    for (const track of singleResult.tracks) {
      aggregatedTrackById.set(track.id, track);
    }

    if (input.onProgress) {
      const percent = totalBytes > 0 ? Math.round((completedBytes / totalBytes) * 100) : 100;
      input.onProgress({
        loaded: Math.min(completedBytes, totalBytes),
        total: totalBytes,
        percent: Math.max(0, Math.min(100, percent))
      });
    }
  }

  aggregate.tracks = Array.from(aggregatedTrackById.values());

  return aggregate;
}

export async function rebuildIndex(): Promise<{ generatedAt: string; totalTracks: number }> {
  return requestJson<{ generatedAt: string; totalTracks: number }>("/api/index/rebuild", {
    method: "POST"
  });
}
