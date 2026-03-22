import type { Response } from "express";

export const SESSION_COOKIE_NAME = "flaque_session";

const DEFAULT_SESSION_TTL_HOURS = 24 * 7;

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

function useSecureSessionCookie(): boolean {
  const fromEnv = parseBooleanEnv(process.env.SESSION_COOKIE_SECURE);
  if (fromEnv !== null) {
    return fromEnv;
  }
  return process.env.NODE_ENV === "production";
}

export function getSessionTtlMs(): number {
  const fromEnv = Number(process.env.SESSION_TTL_HOURS ?? DEFAULT_SESSION_TTL_HOURS);
  const ttlHours = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_SESSION_TTL_HOURS;
  return ttlHours * 60 * 60 * 1000;
}

export function setSessionCookie(res: Response, sessionId: string, expiresAt: number): void {
  const secureCookie = useSecureSessionCookie();

  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    expires: new Date(expiresAt)
  });
}

export function clearSessionCookie(res: Response): void {
  const secureCookie = useSecureSessionCookie();

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie
  });
}
