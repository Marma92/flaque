import type {
  LibraryResponse,
  Playlist,
  PlaylistVisibility,
  Track,
  TrackMetadataPatch,
  TrackTags,
  User
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

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
    } catch {
      // ignore malformed errors
    }
    throw new Error(message);
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

export async function login(username: string, password: string): Promise<User> {
  const payload = await requestJson<{ user: User }>("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });

  return payload.user;
}

export async function logout(): Promise<void> {
  await requestJson<void>("/api/auth/logout", {
    method: "POST",
    skipJson: true
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

export type UploadTracksInput = {
  files: File[];
  artist?: string;
  album?: string;
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

export async function uploadTracks(input: UploadTracksInput): Promise<UploadTracksResult> {
  const formData = new FormData();

  for (const file of input.files) {
    formData.append("files", file);
  }

  if (input.artist?.trim()) {
    formData.append("artist", input.artist.trim());
  }

  if (input.album?.trim()) {
    formData.append("album", input.album.trim());
  }

  return requestJson<UploadTracksResult>("/api/upload", {
    method: "POST",
    body: formData
  });
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

export async function getUsers(): Promise<User[]> {
  const payload = await requestJson<{ users: User[] }>("/api/users");
  return payload.users;
}

export async function createUserAccount(input: {
  username: string;
  password: string;
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

export async function patchUserAccount(
  userId: string,
  patch: {
    username?: string;
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
