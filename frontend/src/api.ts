import type {
  AlbumEntry,
  ArtistEntry,
  LibraryResponse,
  Playlist,
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
  metadataOverrides?: Array<{
    title?: string;
    artist?: string;
    album?: string;
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
  deferRebuild?: boolean;
  metadataOverride?: {
    title?: string;
    artist?: string;
    album?: string;
  } | null;
  onProgress?: (input: { loaded: number; total: number; percent: number }) => void;
};

function uploadSingleTrack(input: UploadSingleTrackInput): Promise<UploadTracksResult> {
  const formData = new FormData();
  formData.append("file", input.file);

  if (input.artist?.trim()) {
    formData.append("artist", input.artist.trim());
  }

  if (input.album?.trim()) {
    formData.append("album", input.album.trim());
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

export async function inspectUploadFile(file: File): Promise<UploadTrackPreview> {
  const formData = new FormData();
  formData.append("file", file);

  return requestJson<UploadTrackPreview>("/api/upload/inspect", {
    method: "POST",
    body: formData
  });
}

export async function rebuildIndex(): Promise<{ generatedAt: string; totalTracks: number }> {
  return requestJson<{ generatedAt: string; totalTracks: number }>("/api/index/rebuild", {
    method: "POST"
  });
}

export async function createPlaylist(input: {
  name: string;
  visibility: PlaylistVisibility;
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

export async function getVersionInfo(): Promise<VersionInfo> {
  return requestJson<VersionInfo>("/api/server/version");
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
