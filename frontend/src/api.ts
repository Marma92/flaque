import type {
  AlbumEntry,
  ArtistEntry,
  AutoPlaylistDetail,
  AutoPlaylistSummary,
  ForYouPlaylistDetail,
  ForYouPlaylistSummary,
  LibraryResponse,
  Playlist,
  RadioCreateResponse,
  RadioQueueResponse,
  RadioStateResponse,
  PlaylistVisibility,
  Track,
  TrackMetadataPatch,
  TrackTags,
  User,
  UserSession
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = RequestInit & {
  skipJson?: boolean;
};

type UnauthorizedHandler = (endpoint: string) => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

// Paths where a 401 is part of the normal login flow rather than a session
// loss — do not fire the global handler for these.
const UNAUTHORIZED_BYPASS = new Set([
  "/api/auth/me",
  "/api/auth/login",
  "/api/auth/forgot-password",
  "/api/auth/reset-password"
]);

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function withApiBase(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${API_BASE}${path}`;
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(withApiBase(path), {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch (parseError) {
      console.warn(`Failed to parse error response from ${options.method ?? "GET"} ${path}:`, parseError);
    }

    if (response.status === 401 && !UNAUTHORIZED_BYPASS.has(path) && unauthorizedHandler) {
      unauthorizedHandler(path);
    }

    throw new ApiError(response.status, path, message);
  }

  if (options.skipJson || response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const payload = await requestJson<{ user: User }>("/api/auth/me");
    return payload.user;
  } catch {
    return null;
  }
}

export async function login(login: string, password: string): Promise<User> {
  const deviceLabel =
    typeof navigator !== "undefined" ? `${navigator.platform || "Unknown platform"} - ${navigator.userAgent}` : undefined;

  const payload = await requestJson<{ user: User }>("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ login, password, deviceLabel })
  });

  return payload.user;
}

export async function requestPasswordReset(login: string): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/auth/forgot-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ login })
  });
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/auth/reset-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ token, newPassword })
  });
}

export async function logout(): Promise<void> {
  await requestJson<void>("/api/auth/logout", {
    method: "POST",
    skipJson: true
  });
}

export async function getMySessions(): Promise<UserSession[]> {
  const payload = await requestJson<{ sessions: UserSession[] }>("/api/auth/sessions");
  return payload.sessions;
}

export async function revokeMySession(sessionId: string): Promise<void> {
  await requestJson<void>(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    skipJson: true
  });
}

export async function logoutOtherSessions(): Promise<{ revoked: number }> {
  return requestJson<{ revoked: number }>("/api/auth/logout-others", {
    method: "POST"
  });
}

export function myProfilePhotoUrl(input?: { version?: number; userId?: string }): string {
  const searchParams = new URLSearchParams();

  if (typeof input?.version === "number") {
    searchParams.set("v", String(input.version));
  }

  if (typeof input?.userId === "string" && input.userId.trim()) {
    searchParams.set("u", input.userId.trim());
  }

  const query = searchParams.toString();
  const suffix = query ? `?${query}` : "";
  return withApiBase(`/api/users/me/photo${suffix}`);
}

export async function uploadMyProfilePhoto(file: File): Promise<void> {
  const formData = new FormData();
  formData.append("photo", file);

  await requestJson<{ ok: boolean }>("/api/users/me/photo", {
    method: "POST",
    body: formData
  });
}

export async function updateMyPassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/users/me/password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

export async function getLibrary(filters: {
  owner?: string;
  artist?: string;
  album?: string;
  q?: string;
}): Promise<LibraryResponse> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (!value) {
      continue;
    }
    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  const path = query ? `/api/library?${query}` : "/api/library";

  return requestJson<LibraryResponse>(path);
}

export type TracksResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  sortBy: string;
  sortDir: string;
  tracks: Track[];
};

export type RecentUploadAlbum = {
  albumName: string;
  artist: string;
  owner: string;
  trackCount: number;
  coverTrackId: string;
  tracks: Track[];
};

export type RecentUploadItem =
  | { kind: "track"; track: Track }
  | { kind: "album"; album: RecentUploadAlbum };

export async function getRecentUploads(params: {
  addedAfter: string;
  limit?: number;
  owner?: string;
}): Promise<RecentUploadItem[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("addedAfter", params.addedAfter);
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.owner) searchParams.set("owner", params.owner);
  const payload = await requestJson<{ items?: RecentUploadItem[] }>(`/api/recent-uploads?${searchParams.toString()}`);
  return payload.items ?? [];
}

export async function getTracks(params: {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  addedAfter?: string;
  owner?: string;
  artist?: string;
  album?: string;
  q?: string;
}): Promise<TracksResponse> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  const path = query ? `/api/tracks?${query}` : "/api/tracks";

  return requestJson<TracksResponse>(path);
}

export async function getArtists(filters: {
  owner?: string;
  q?: string;
}): Promise<ArtistEntry[]> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (!value) {
      continue;
    }
    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  const path = query ? `/api/artists?${query}` : "/api/artists";
  const payload = await requestJson<{ artists: ArtistEntry[] }>(path);
  return payload.artists;
}

export async function getAlbums(filters: {
  owner?: string;
  artist?: string;
  q?: string;
}): Promise<AlbumEntry[]> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (!value) {
      continue;
    }
    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  const path = query ? `/api/albums?${query}` : "/api/albums";
  const payload = await requestJson<{ albums: AlbumEntry[] }>(path);
  return payload.albums;
}

export async function getArtistAlbums(
  artist: string,
  filters: {
    owner?: string;
    q?: string;
  }
): Promise<AlbumEntry[]> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (!value) {
      continue;
    }
    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  const encodedArtist = encodeURIComponent(artist.trim());
  const path = query ? `/api/artists/${encodedArtist}/albums?${query}` : `/api/artists/${encodedArtist}/albums`;
  const payload = await requestJson<{ albums: AlbumEntry[] }>(path);
  return payload.albums;
}

export async function getAlbumTracks(albumId: string): Promise<Track[]> {
  const payload = await requestJson<{ tracks: Track[] }>(`/api/album/${encodeURIComponent(albumId)}`);
  return payload.tracks;
}

export function coverPathUrl(relativePath: string): string {
  const searchParams = new URLSearchParams({ path: relativePath });
  return withApiBase(`/api/covers/from-path?${searchParams.toString()}`);
}

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

export async function createPlaylist(input: {
  name: string;
  visibility: PlaylistVisibility;
  description?: string;
}): Promise<Playlist> {
  const payload = await requestJson<{ playlist: Playlist }>("/api/playlists", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  return payload.playlist;
}

export async function patchPlaylist(
  playlistId: string,
  patch: {
    name?: string;
    visibility?: PlaylistVisibility;
    trackIds?: string[];
    description?: string;
    collaborators?: string[];
  }
): Promise<Playlist> {
  const payload = await requestJson<{ playlist: Playlist }>(`/api/playlists/${encodeURIComponent(playlistId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  });

  return payload.playlist;
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await requestJson(`/api/playlists/${encodeURIComponent(playlistId)}`, {
    method: "DELETE",
    skipJson: true
  });
}

export async function heartPlaylist(playlistId: string): Promise<{ hearted: boolean; heartCount: number }> {
  return requestJson<{ hearted: boolean; heartCount: number }>(
    `/api/playlists/${encodeURIComponent(playlistId)}/heart`,
    { method: "POST" }
  );
}

export async function reportPlaylistListen(playlistId: string): Promise<void> {
  await requestJson(`/api/playlists/${encodeURIComponent(playlistId)}/listen`, {
    method: "POST"
  }).catch(() => {});
}

export function playlistCoverUrl(playlistId: string): string {
  return withApiBase(`/api/playlists/${encodeURIComponent(playlistId)}/cover`);
}

export async function uploadPlaylistCover(playlistId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("cover", file);
  await requestJson<{ ok: boolean }>(`/api/playlists/${encodeURIComponent(playlistId)}/cover`, {
    method: "POST",
    body: formData
  });
}

export async function deletePlaylistCover(playlistId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/playlists/${encodeURIComponent(playlistId)}/cover`, {
    method: "DELETE"
  });
}

export async function getAutoPlaylists(): Promise<AutoPlaylistSummary[]> {
  const payload = await requestJson<{ playlists: AutoPlaylistSummary[] }>("/api/playlists/automatic");
  return payload.playlists;
}

export async function getAutoPlaylistDetail(id: string): Promise<{ playlist: AutoPlaylistDetail; tracks: Track[] }> {
  return requestJson<{ playlist: AutoPlaylistDetail; tracks: Track[] }>(
    `/api/playlists/automatic/${encodeURIComponent(id)}`
  );
}

export async function regenerateAutoPlaylists(): Promise<{ regenerated: number }> {
  return requestJson<{ regenerated: number }>("/api/playlists/automatic/regenerate", {
    method: "POST"
  });
}

export async function getForYouPlaylists(): Promise<ForYouPlaylistSummary[]> {
  const payload = await requestJson<{ playlists: ForYouPlaylistSummary[] }>("/api/playlists/for-you");
  return payload.playlists;
}

export async function getForYouPlaylistDetail(id: string): Promise<{ playlist: ForYouPlaylistDetail; tracks: Track[] }> {
  return requestJson<{ playlist: ForYouPlaylistDetail; tracks: Track[] }>(
    `/api/playlists/for-you/${encodeURIComponent(id)}`
  );
}

export async function dismissForYouPlaylist(playlistId: string): Promise<void> {
  await requestJson<void>(
    `/api/playlists/for-you/${encodeURIComponent(playlistId)}/dismiss`,
    { method: "POST", skipJson: true }
  );
}

export async function regenerateForYouPlaylists(): Promise<{ regenerated: number }> {
  return requestJson<{ regenerated: number }>("/api/playlists/for-you/regenerate", {
    method: "POST"
  });
}

export async function getUsers(): Promise<User[]> {
  const payload = await requestJson<{ users: User[] }>("/api/users");
  return payload.users;
}

export async function createUserAccount(input: {
  username: string;
  password: string;
  email: string;
  role?: "user" | "admin";
}): Promise<User> {
  const payload = await requestJson<{ user: User }>("/api/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  return payload.user;
}

export async function updateMyEmail(email: string): Promise<User> {
  const payload = await requestJson<{ user: User }>("/api/users/me/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email })
  });

  return payload.user;
}

export async function patchUserAccount(
  userId: string,
  patch: {
    username?: string;
    email?: string;
    role?: "user" | "admin";
  }
): Promise<User> {
  const payload = await requestJson<{ user: User }>(`/api/users/${userId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  });

  return payload.user;
}

export async function deleteUserAccount(userId: string): Promise<void> {
  await requestJson<void>(`/api/users/${userId}`, {
    method: "DELETE",
    skipJson: true
  });
}

export async function resetUserPassword(userId: string, password: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/users/${userId}/reset-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password })
  });
}

export async function getAdjacentTrack(input: {
  trackId: string;
  direction: "next" | "previous";
  wrap?: boolean;
  owner?: string;
  artist?: string;
  album?: string;
  q?: string;
}): Promise<Track | null> {
  const searchParams = new URLSearchParams();
  searchParams.set("direction", input.direction);

  if (input.wrap === false) {
    searchParams.set("wrap", "false");
  }

  for (const [key, value] of Object.entries({
    owner: input.owner,
    artist: input.artist,
    album: input.album,
    q: input.q
  })) {
    if (!value) {
      continue;
    }
    searchParams.set(key, value);
  }

  const payload = await requestJson<{ track: Track | null }>(
    `/api/tracks/${encodeURIComponent(input.trackId)}/adjacent?${searchParams.toString()}`
  );

  return payload.track;
}

export async function updateTrackMetadata(trackId: string, patch: TrackMetadataPatch): Promise<Track> {
  const payload = await requestJson<{ track: Track }>(`/api/tracks/${encodeURIComponent(trackId)}/metadata`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  });

  return payload.track;
}

export async function deleteTrackFile(trackId: string): Promise<{
  deletedTrackId: string;
  totalTracks: number;
}> {
  return requestJson<{ deletedTrackId: string; totalTracks: number }>(
    `/api/tracks/${encodeURIComponent(trackId)}`,
    {
      method: "DELETE"
    }
  );
}

export async function bulkDeleteTracks(trackIds: string[]): Promise<{
  deleted: string[];
  notFound: string[];
  totalTracks: number;
}> {
  return requestJson<{ deleted: string[]; notFound: string[]; totalTracks: number }>(
    "/api/tracks/bulk/delete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds })
    }
  );
}

export async function bulkUpdateTrackMetadata(
  trackIds: string[],
  patch: TrackMetadataPatch
): Promise<{ updated: string[]; notFound: string[] }> {
  return requestJson<{ updated: string[]; notFound: string[] }>(
    "/api/tracks/bulk/metadata",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds, ...patch })
    }
  );
}

export async function createRadioStation(): Promise<RadioCreateResponse> {
  return requestJson<RadioCreateResponse>("/api/radio/create", {
    method: "POST"
  });
}

export async function getRadioState(): Promise<RadioStateResponse> {
  return requestJson<RadioStateResponse>("/api/radio/state");
}

export async function getRadioQueue(): Promise<RadioQueueResponse> {
  return requestJson<RadioQueueResponse>("/api/radio/queue");
}

export async function rebuildRadioStation(stationId: string): Promise<RadioCreateResponse> {
  return requestJson<RadioCreateResponse>(`/api/radio/rebuild/${encodeURIComponent(stationId)}`, {
    method: "POST"
  });
}

export function streamUrl(trackId: string, options?: { transcode?: "opus" | "mp3" }): string {
  const basePath = `/api/tracks/${trackId}/stream`;
  if (!options?.transcode) {
    return withApiBase(basePath);
  }

  const search = new URLSearchParams({ transcode: options.transcode });
  return withApiBase(`${basePath}?${search.toString()}`);
}

export function coverUrl(trackId: string, coverPath?: string): string {
  if (coverPath) {
    return withApiBase(coverPath);
  }
  return withApiBase(`/api/covers/${trackId}`);
}

export async function reportTrackPlay(trackId: string): Promise<void> {
  await fetch(withApiBase(`/api/tracks/${encodeURIComponent(trackId)}/play`), {
    method: "POST",
    credentials: "include"
  });
}

export type PlayStatsResponse = {
  topTracks: Array<{ trackId: string; count: number; lastPlayedAt: string }>;
  topArtists: Array<{ artist: string; playCount: number }>;
  totalPlays: number;
  uniqueTracksPlayed: number;
};

export async function getMyPlayStats(): Promise<PlayStatsResponse> {
  return requestJson<PlayStatsResponse>("/api/me/play-stats");
}

// ── Admin: Genre Management ───────────────────────────────────────────

export type GenreSynonyms = Record<string, string>;

export async function getGenreSynonyms(): Promise<GenreSynonyms> {
  return requestJson<GenreSynonyms>("/api/genre/synonyms");
}

export async function putGenreSynonym(key: string, value: string): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/genre/synonyms", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: key, to: value })
  });
}

export async function deleteGenreSynonym(key: string): Promise<void> {
  await requestJson<void>(`/api/genre/synonyms/${encodeURIComponent(key)}`, {
    method: "DELETE",
    skipJson: true
  });
}

export async function resetGenreSynonyms(): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/genre/synonyms/reset", { method: "POST" });
}

export type EnrichmentStatus = {
  running: boolean;
  processed: number;
  total: number;
  enriched: number;
  failed: number;
  startedAt: string | null;
};

export async function getEnrichmentStatus(): Promise<EnrichmentStatus> {
  return requestJson<EnrichmentStatus>("/api/genre/enrichment/status");
}

export async function startEnrichment(): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/genre/enrichment/start", { method: "POST" });
}

export async function stopEnrichment(): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/genre/enrichment/stop", { method: "POST" });
}

export type GenreCacheStats = {
  entries: number;
};

export async function getGenreCacheStats(): Promise<GenreCacheStats> {
  return requestJson<GenreCacheStats>("/api/genre/cache/stats");
}

export async function clearGenreCache(): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/genre/cache/clear", { method: "POST" });
}

// ── Admin: Auto-Playlist Config ──────────────────────────────────────

export type AutoPlaylistConfig = {
  maxPlaylists: number;
  minTracksPerPlaylist: number;
  tracksPerPlaylist: number;
};

export async function getAutoPlaylistConfig(): Promise<AutoPlaylistConfig> {
  return requestJson<AutoPlaylistConfig>("/api/playlists/automatic/config");
}

export async function patchAutoPlaylistConfig(patch: Partial<AutoPlaylistConfig>): Promise<AutoPlaylistConfig> {
  return requestJson<AutoPlaylistConfig>("/api/playlists/automatic/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
}

// ── Admin: Server Logs ────────────────────────────────────────────────

export type LogFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

export type LogEntry = {
  level: number;
  time: number;
  msg: string;
  context?: string;
  [key: string]: unknown;
};

export type StorageUsage = {
  disk: { total: number; free: number; used: number };
  directories: Array<{ name: string; path: string; size: number }>;
  totalDataSize: number;
};

export type SystemStats = {
  cpu: { usagePercent: number; cores: number; model?: string };
  memory: { total: number; used: number; free: number; usagePercent: number };
};

export type VersionInfo = {
  currentVersion: string;
  latestVersion: string | null;
  isUpdateAvailable: boolean;
  releaseUrl: string | null;
  releaseName: string | null;
  publishedAt: string | null;
  checkedAt: string | null;
};

export async function getStorageUsage(): Promise<StorageUsage> {
  return requestJson<StorageUsage>("/api/logs/storage");
}

export async function getSystemStats(): Promise<SystemStats> {
  return requestJson<SystemStats>("/api/logs/system-stats");
}

export async function getVersionInfo(): Promise<VersionInfo> {
  return requestJson<VersionInfo>("/api/server/version");
}

export async function checkForUpdates(): Promise<VersionInfo> {
  return requestJson<VersionInfo>("/api/server/version/check", { method: "POST" });
}

export type UpdateStatus = {
  status: "idle" | "updating" | "complete" | "failed" | "unavailable";
  message?: string;
  timestamp?: string;
};

export async function triggerUpdate(): Promise<UpdateStatus> {
  return requestJson<UpdateStatus>("/api/server/update", { method: "POST" });
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  return requestJson<UpdateStatus>("/api/server/update/status");
}

export async function getLogFiles(): Promise<LogFile[]> {
  const payload = await requestJson<{ files: LogFile[] }>("/api/logs/files");
  return payload.files;
}

export async function getLogEntries(params: {
  file: string;
  limit?: number;
  offset?: number;
  level?: number;
}): Promise<{
  file: string;
  total: number;
  offset: number;
  limit: number;
  entries: LogEntry[];
}> {
  const searchParams = new URLSearchParams();
  searchParams.set("file", params.file);
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params.level !== undefined) searchParams.set("level", String(params.level));
  return requestJson(`/api/logs/entries?${searchParams.toString()}`);
}

// ── Backup ──────────────────────────────────────────────────────────────

export type BackupConfig = {
  scheduledEnabled: boolean;
  intervalHours: number;
  retentionDays: number;
  includeIndex: boolean;
};

export type BackupEntry = {
  id: string;
  createdAt: string;
  trigger: "manual" | "scheduled";
  includesDatabase: boolean;
  includesIndex: boolean;
  sizeBytes: number;
  files: string[];
};

export async function getBackupConfig(): Promise<BackupConfig> {
  return requestJson<BackupConfig>("/api/backup/config");
}

export async function updateBackupConfig(config: Partial<BackupConfig>): Promise<BackupConfig> {
  return requestJson<BackupConfig>("/api/backup/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config)
  });
}

export async function createBackup(): Promise<BackupEntry> {
  return requestJson<BackupEntry>("/api/backup", { method: "POST" });
}

export async function getBackups(): Promise<BackupEntry[]> {
  const payload = await requestJson<{ backups: BackupEntry[] }>("/api/backups");
  return payload.backups;
}

export async function deleteBackup(id: string): Promise<void> {
  await requestJson<void>(`/api/backups/${encodeURIComponent(id)}`, { method: "DELETE", skipJson: true });
}

export async function restoreBackup(id: string): Promise<{ message: string }> {
  return requestJson<{ message: string }>(`/api/backups/${encodeURIComponent(id)}/restore`, { method: "POST" });
}

export function getBackupDownloadUrl(id: string): string {
  return withApiBase(`/api/backups/${encodeURIComponent(id)}/download`);
}

export async function purgeExpiredBackups(): Promise<{ deleted: number; retentionDays: number }> {
  return requestJson("/api/backups/purge", { method: "POST" });
}
