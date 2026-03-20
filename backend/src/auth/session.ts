import type { Response } from "express";

export const SESSION_COOKIE_NAME = "flaque_session";

const DEFAULT_SESSION_TTL_HOURS = 24 * 7;

function shouldUseSecureCookie(): boolean {
  const raw = (process.env.SESSION_COOKIE_SECURE ?? "").trim().toLowerCase();

  if (raw === "1" || raw === "true" || raw === "yes") {
    return true;
  }

  if (raw === "0" || raw === "false" || raw === "no") {
    return false;
  }

  return process.env.NODE_ENV === "production";
}

export function getSessionTtlMs(): number {
  const fromEnv = Number(process.env.SESSION_TTL_HOURS ?? DEFAULT_SESSION_TTL_HOURS);
  const ttlHours = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_SESSION_TTL_HOURS;
  return ttlHours * 60 * 60 * 1000;
}

export function setSessionCookie(res: Response, sessionId: string, expiresAt: number): void {
  const secureCookie = shouldUseSecureCookie();

  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    expires: new Date(expiresAt)
  });
}

export function clearSessionCookie(res: Response): void {
  const secureCookie = shouldUseSecureCookie();

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie
  });
}
