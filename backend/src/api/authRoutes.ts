import { createHash } from "node:crypto";

import { Router, type Request, type Response } from "express";
import { normalizeLanguage } from "@flaque/shared";

import { AppError } from "../utils/AppError";

import { findUserByLogin, updateUserPassword } from "../auth/db";
import { requireAuth } from "../auth/middleware";
import { verifyPassword } from "../auth/password";
import { consumePasswordResetToken, createPasswordResetToken } from "../auth/passwordResetDb";
import { sendPasswordResetEmail } from "../auth/passwordResetEmail";
import {
  clearSessionCookie,
  getSessionTtlMs,
  setSessionCookie
} from "../auth/session";
import {
  createSession,
  deleteOtherUserSessions,
  deleteSession,
  deleteSessionForUser,
  listSessionsByUserId
} from "../auth/sessionDb";
import { getClientIp } from "./requestHelpers";
import { createLogger } from "../utils/logger";
import { normalizeOptionalString, validatePassword } from "../utils/validation";

const log = createLogger("auth");

const DEFAULT_PASSWORD_RESET_TTL_MINUTES = 30;
const DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_AUTH_LOGIN_RATE_LIMIT_MAX = 20;
const DEFAULT_AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX = 5;
const DEFAULT_AUTH_RESET_PASSWORD_RATE_LIMIT_MAX = 10;
const DEFAULT_AUTH_FORGOT_PASSWORD_MIN_RESPONSE_MS = 300;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function parseDeviceLabel(value: unknown): string | undefined {
  const label = normalizeOptionalString(value);
  return label ? label.slice(0, 128) : undefined;
}

function readNonNegativeIntEnv(name: string, fallback: number): number {
  const rawValue = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(rawValue) || rawValue < 0) {
    return fallback;
  }

  return Math.floor(rawValue);
}

function emitAuthAuditLog(level: "info" | "warn", event: string, details: Record<string, string | number | boolean>): void {
  log[level](event, details);
}

function truncateLoginAttempt(value: string): string {
  return value.length > 64 ? `${value.slice(0, 64)}…` : value;
}

function fingerprintValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function buildRateLimitKey(scope: string, req: Request): string {
  const ip = (getClientIp(req) ?? "unknown").slice(0, 128);
  return `${scope}:${ip}`;
}

function pruneRateLimitBuckets(now: number): void {
  if (rateLimitBuckets.size <= 4096) {
    return;
  }

  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function consumeRateLimitToken(
  scope: string,
  req: Request,
  maxAttempts: number,
  windowMs: number
): { limited: boolean; retryAfterSeconds: number } {
  if (maxAttempts <= 0 || windowMs <= 0) {
    return { limited: false, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  pruneRateLimitBuckets(now);
  const key = buildRateLimitKey(scope, req);
  const existing = rateLimitBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return { limited: false, retryAfterSeconds: 0 };
  }

  if (existing.count >= maxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      limited: true,
      retryAfterSeconds
    };
  }

  existing.count += 1;
  return { limited: false, retryAfterSeconds: 0 };
}

function sendRateLimitedResponse(res: Response, retryAfterSeconds: number): void {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(429).json({ error: "Too many requests. Try again later." });
}

function getAuthRateLimitWindowMs(): number {
  return readNonNegativeIntEnv("AUTH_RATE_LIMIT_WINDOW_MS", DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS);
}

function getAuthLoginRateLimitMax(): number {
  return readNonNegativeIntEnv("AUTH_LOGIN_RATE_LIMIT_MAX", DEFAULT_AUTH_LOGIN_RATE_LIMIT_MAX);
}

function getAuthForgotPasswordRateLimitMax(): number {
  return readNonNegativeIntEnv(
    "AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX",
    DEFAULT_AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX
  );
}

function getAuthResetPasswordRateLimitMax(): number {
  return readNonNegativeIntEnv("AUTH_RESET_PASSWORD_RATE_LIMIT_MAX", DEFAULT_AUTH_RESET_PASSWORD_RATE_LIMIT_MAX);
}

function getForgotPasswordMinResponseMs(): number {
  return readNonNegativeIntEnv(
    "AUTH_FORGOT_PASSWORD_MIN_RESPONSE_MS",
    DEFAULT_AUTH_FORGOT_PASSWORD_MIN_RESPONSE_MS
  );
}

async function waitForMinimumDuration(startedAt: number, minDurationMs: number): Promise<void> {
  if (minDurationMs <= 0) {
    return;
  }

  const elapsed = Date.now() - startedAt;
  if (elapsed >= minDurationMs) {
    return;
  }

  await new Promise<void>((resolve) => {
    setTimeout(resolve, minDurationMs - elapsed);
  });
}

function getPasswordResetTtlMs(): number {
  const rawMinutes = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ?? DEFAULT_PASSWORD_RESET_TTL_MINUTES);
  const minutes = Number.isFinite(rawMinutes) && rawMinutes > 0 ? Math.floor(rawMinutes) : DEFAULT_PASSWORD_RESET_TTL_MINUTES;
  return minutes * 60 * 1000;
}

function getPasswordResetBaseUrl(req: Request): string {
  const fromEnv = (process.env.PASSWORD_RESET_BASE_URL ?? "").trim();
  if (fromEnv) {
    return fromEnv;
  }

  const firstCorsOrigin = (process.env.CORS_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .find(Boolean);
  if (firstCorsOrigin) {
    return firstCorsOrigin;
  }

  return `${req.protocol}://${req.get("host") ?? "localhost:4000"}`;
}

function buildPasswordResetUrl(req: Request, token: string): string {
  try {
    const url = new URL(getPasswordResetBaseUrl(req));
    url.searchParams.set("resetToken", token);
    return url.toString();
  } catch {
    return `${getPasswordResetBaseUrl(req)}?resetToken=${encodeURIComponent(token)}`;
  }
}

export function createAuthRouter(): Router {
  const router = Router();

  router.post("/login", (req, res, next) => {
    const login = normalizeOptionalString(req.body?.login ?? req.body?.username) ?? "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const ip = getClientIp(req) ?? "unknown";
    const loginFingerprint = login ? fingerprintValue(login.toLowerCase()) : "missing";

    const loginRateLimit = consumeRateLimitToken(
      "login",
      req,
      getAuthLoginRateLimitMax(),
      getAuthRateLimitWindowMs()
    );
    if (loginRateLimit.limited) {
      emitAuthAuditLog("warn", "rate-limit-hit", {
        route: "login",
        ip,
        retryAfterSeconds: loginRateLimit.retryAfterSeconds
      });
      sendRateLimitedResponse(res, loginRateLimit.retryAfterSeconds);
      return;
    }

    if (!login || !password) {
      emitAuthAuditLog("warn", "login-bad-request", {
        ip,
        loginFingerprint,
        loginAttempt: login ? truncateLoginAttempt(login) : "(missing)"
      });
      return next(new AppError("login and password are required", 400));
    }

    const user = findUserByLogin(login);
    if (!user || !verifyPassword(password, user.password_hash)) {
      emitAuthAuditLog("warn", "login-failed", {
        ip,
        loginFingerprint,
        loginAttempt: truncateLoginAttempt(login),
        ...(user ? { username: user.username } : {})
      });
      return next(new AppError("Invalid credentials", 401));
    }

    const session = createSession({
      userId: user.id,
      ttlMs: getSessionTtlMs(),
      userAgent: req.get("user-agent"),
      ipAddress: getClientIp(req),
      label: parseDeviceLabel(req.body?.deviceLabel)
    });
    setSessionCookie(res, session.id, session.expiresAt);

    emitAuthAuditLog("info", "login-succeeded", {
      ip,
      userId: user.id,
      username: user.username
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email ?? "",
        role: user.role,
        language: normalizeLanguage(user.language)
      }
    });
  });

  router.post("/forgot-password", async (req, res, next) => {
    const startedAt = Date.now();
    const login = normalizeOptionalString(req.body?.login ?? req.body?.username ?? req.body?.email) ?? "";
    const ip = getClientIp(req) ?? "unknown";
    const loginFingerprint = login ? fingerprintValue(login.toLowerCase()) : "missing";

    const forgotRateLimit = consumeRateLimitToken(
      "forgot-password",
      req,
      getAuthForgotPasswordRateLimitMax(),
      getAuthRateLimitWindowMs()
    );
    if (forgotRateLimit.limited) {
      emitAuthAuditLog("warn", "rate-limit-hit", {
        route: "forgot-password",
        ip,
        retryAfterSeconds: forgotRateLimit.retryAfterSeconds
      });
      sendRateLimitedResponse(res, forgotRateLimit.retryAfterSeconds);
      return;
    }

    if (!login) {
      emitAuthAuditLog("warn", "forgot-password-bad-request", {
        ip,
        loginFingerprint
      });
      return next(new AppError("login is required", 400));
    }

    emitAuthAuditLog("info", "forgot-password-requested", {
      ip,
      loginFingerprint
    });

    const user = findUserByLogin(login);
    if (user?.email) {
      const resetToken = createPasswordResetToken({
        userId: user.id,
        ttlMs: getPasswordResetTtlMs(),
        requestedIp: getClientIp(req),
        requestedUserAgent: req.get("user-agent")
      });

      const resetUrl = buildPasswordResetUrl(req, resetToken.token);
      void sendPasswordResetEmail({
        to: user.email,
        username: user.username,
        resetUrl,
        expiresAt: resetToken.expiresAt,
        language: normalizeLanguage(user.language)
      }).then((sent) => {
        emitAuthAuditLog(sent ? "info" : "warn", "forgot-password-email-dispatch", {
          ip,
          userId: user.id,
          sent
        });
      });
    }

    await waitForMinimumDuration(startedAt, getForgotPasswordMinResponseMs());
    res.json({ ok: true });
  });

  router.post("/reset-password", (req, res, next) => {
    const token = normalizeOptionalString(req.body?.token) ?? "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const ip = getClientIp(req) ?? "unknown";

    const resetRateLimit = consumeRateLimitToken(
      "reset-password",
      req,
      getAuthResetPasswordRateLimitMax(),
      getAuthRateLimitWindowMs()
    );
    if (resetRateLimit.limited) {
      emitAuthAuditLog("warn", "rate-limit-hit", {
        route: "reset-password",
        ip,
        retryAfterSeconds: resetRateLimit.retryAfterSeconds
      });
      sendRateLimitedResponse(res, resetRateLimit.retryAfterSeconds);
      return;
    }

    if (!token || !newPassword) {
      emitAuthAuditLog("warn", "reset-password-bad-request", {
        ip
      });
      return next(new AppError("token and newPassword are required", 400));
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return next(new AppError(passwordError, 400));
    }

    const consumedToken = consumePasswordResetToken(token);
    if (!consumedToken) {
      emitAuthAuditLog("warn", "reset-password-invalid-token", {
        ip
      });
      return next(new AppError("Invalid or expired reset token", 400));
    }

    const updated = updateUserPassword(consumedToken.userId, newPassword);
    if (!updated) {
      emitAuthAuditLog("warn", "reset-password-update-failed", {
        ip,
        userId: consumedToken.userId
      });
      return next(new AppError("Invalid or expired reset token", 400));
    }

    emitAuthAuditLog("info", "reset-password-succeeded", {
      ip,
      userId: consumedToken.userId
    });

    res.json({ ok: true });
  });

  router.post("/logout", requireAuth, (req, res) => {
    emitAuthAuditLog("info", "logout", {
      userId: req.authUser?.id ?? "unknown",
      ip: getClientIp(req) ?? "unknown"
    });

    if (req.sessionId) {
      deleteSession(req.sessionId);
    }
    clearSessionCookie(res);
    res.status(204).send();
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.authUser });
  });

  router.get("/sessions", requireAuth, (req, res, next) => {
    const authUser = req.authUser;
    const currentSessionId = req.sessionId;
    if (!authUser || !currentSessionId) {
      return next(new AppError("Authentication required", 401));
    }

    const sessions = listSessionsByUserId(authUser.id).map((session) => ({
      ...session,
      current: session.id === currentSessionId
    }));

    res.json({ sessions });
  });

  router.delete("/sessions/:id", requireAuth, (req, res, next) => {
    const authUser = req.authUser;
    const currentSessionId = req.sessionId;
    const targetSessionId = typeof req.params?.id === "string" ? req.params.id.trim() : "";

    if (!authUser || !currentSessionId) {
      return next(new AppError("Authentication required", 401));
    }

    if (!targetSessionId) {
      return next(new AppError("session id is required", 400));
    }

    const deleted = deleteSessionForUser(targetSessionId, authUser.id);
    if (!deleted) {
      return next(new AppError("Session not found", 404));
    }

    emitAuthAuditLog("info", "session-revoked", {
      userId: authUser.id,
      targetSessionId,
      self: targetSessionId === currentSessionId,
      ip: getClientIp(req) ?? "unknown"
    });

    if (targetSessionId === currentSessionId) {
      clearSessionCookie(res);
    }

    res.status(204).send();
  });

  router.post("/logout-others", requireAuth, (req, res, next) => {
    const authUser = req.authUser;
    const currentSessionId = req.sessionId;
    if (!authUser || !currentSessionId) {
      return next(new AppError("Authentication required", 401));
    }

    const revoked = deleteOtherUserSessions(authUser.id, currentSessionId);

    emitAuthAuditLog("info", "logout-others", {
      userId: authUser.id,
      revoked,
      ip: getClientIp(req) ?? "unknown"
    });

    res.json({ revoked });
  });

  return router;
}
