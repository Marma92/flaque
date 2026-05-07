import type { User } from "../types";
import { requestJson, withApiBase } from "./client";

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

export type PlayStatsResponse = {
  topTracks: Array<{ trackId: string; count: number; lastPlayedAt: string }>;
  topArtists: Array<{ artist: string; playCount: number }>;
  totalPlays: number;
  uniqueTracksPlayed: number;
};

export async function getMyPlayStats(): Promise<PlayStatsResponse> {
  return requestJson<PlayStatsResponse>("/api/me/play-stats");
}
