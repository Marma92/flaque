import type { User, UserSession } from "../types";
import { requestJson } from "./client";

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
