import type { LibraryResponse, User } from "./types";

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

export async function uploadTrack(file: File): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);

  await requestJson<{ track?: unknown }>("/api/upload", {
    method: "POST",
    body: formData
  });
}

export async function rebuildIndex(): Promise<{ generatedAt: string; totalTracks: number }> {
  return requestJson<{ generatedAt: string; totalTracks: number }>("/api/index/rebuild", {
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

export function streamUrl(trackId: string): string {
  return withApiBase(`/api/tracks/${trackId}/stream`);
}

export function coverUrl(trackId: string, coverPath?: string): string {
  if (coverPath) {
    return withApiBase(coverPath);
  }
  return withApiBase(`/api/covers/${trackId}`);
}
