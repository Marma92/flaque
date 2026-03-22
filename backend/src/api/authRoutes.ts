import { createHash } from "node:crypto";

import { Router, type Request, type Response } from "express";

import { requireAuth } from "../auth/middleware";
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  createSession,
  deleteOtherUserSessions,
  deleteSessionForUser,
  deleteSession,
  findUserByLogin,
  listSessionsByUserId,
  updateUserPassword
} from "../auth/db";
import { verifyPassword } from "../auth/password";
import { sendPasswordResetEmail } from "../auth/passwordResetEmail";
import {
  clearSessionCookie,
  getSessionTtlMs,
  setSessionCookie
} from "../auth/session";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 256;
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

function getClientIp(req: Request): string | undefined {
  const forwardedFor = req.headers["x-forwarded-for"];
  const firstForwarded =
    typeof forwardedFor === "string"
      ? forwardedFor.split(",", 1)[0]
      : Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : undefined;

  const candidate = (firstForwarded ?? req.ip ?? req.socket.remoteAddress ?? "").trim();
  return candidate || undefined;
}

function parseDeviceLabel(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const label = value.trim();
  if (!label) {
    return undefined;
  }

  return label.slice(0, 128);
}

function parseLoginValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function readNonNegativeIntEnv(name: string, fallback: number): number {
  const rawValue = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(rawValue) || rawValue < 0) {
    return fallback;
  }

  return Math.floor(rawValue);
}

function isAuthAuditLogEnabled(): boolean {
  const rawValue = (process.env.AUTH_AUDIT_LOGS ?? "").trim().toLowerCase();
  if (rawValue === "1" || rawValue === "true" || rawValue === "yes") {
    return true;
  }

  if (rawValue === "0" || rawValue === "false" || rawValue === "no") {
    return false;
  }

  return process.env.NODE_ENV !== "test";
}

function emitAuthAuditLog(level: "info" | "warn", event: string, details: Record<string, string | number | boolean>): void {
  if (!isAuthAuditLogEnabled()) {
    return;
  }

  const logger = level === "warn" ? console.warn : console.info;
  logger(`[auth] ${event} ${JSON.stringify(details)}`);
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

  router.post("/login", (req, res) => {
    const login = parseLoginValue(req.body?.login ?? req.body?.username);
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
        loginFingerprint
      });
      res.status(400).json({ error: "login and password are required" });
      return;
    }

    const user = findUserByLogin(login);
    if (!user || !verifyPassword(password, user.password_hash)) {
      emitAuthAuditLog("warn", "login-failed", {
        ip,
        loginFingerprint
      });
      res.status(401).json({ error: "Invalid credentials" });
      return;
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
      userId: user.id
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  });

  router.post("/forgot-password", async (req, res) => {
    const startedAt = Date.now();
    const login = parseLoginValue(req.body?.login ?? req.body?.username ?? req.body?.email);
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
      res.status(400).json({ error: "login is required" });
      return;
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
        expiresAt: resetToken.expiresAt
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

  router.post("/reset-password", (req, res) => {
    const token = parseLoginValue(req.body?.token);
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
      res.status(400).json({ error: "token and newPassword are required" });
      return;
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
      res.status(400).json({
        error: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`
      });
      return;
    }

    const consumedToken = consumePasswordResetToken(token);
    if (!consumedToken) {
      emitAuthAuditLog("warn", "reset-password-invalid-token", {
        ip
      });
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }

    const updated = updateUserPassword(consumedToken.userId, newPassword);
    if (!updated) {
      emitAuthAuditLog("warn", "reset-password-update-failed", {
        ip,
        userId: consumedToken.userId
      });
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }

    emitAuthAuditLog("info", "reset-password-succeeded", {
      ip,
      userId: consumedToken.userId
    });

    res.json({ ok: true });
  });

  router.post("/logout", requireAuth, (req, res) => {
    if (req.sessionId) {
      deleteSession(req.sessionId);
    }
    clearSessionCookie(res);
    res.status(204).send();
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.authUser });
  });

  router.get("/sessions", requireAuth, (req, res) => {
    const authUser = req.authUser;
    const currentSessionId = req.sessionId;
    if (!authUser || !currentSessionId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const sessions = listSessionsByUserId(authUser.id).map((session) => ({
      ...session,
      current: session.id === currentSessionId
    }));

    res.json({ sessions });
  });

  router.delete("/sessions/:id", requireAuth, (req, res) => {
    const authUser = req.authUser;
    const currentSessionId = req.sessionId;
    const targetSessionId = typeof req.params?.id === "string" ? req.params.id.trim() : "";

    if (!authUser || !currentSessionId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!targetSessionId) {
      res.status(400).json({ error: "session id is required" });
      return;
    }

    const deleted = deleteSessionForUser(targetSessionId, authUser.id);
    if (!deleted) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    if (targetSessionId === currentSessionId) {
      clearSessionCookie(res);
    }

    res.status(204).send();
  });

  router.post("/logout-others", requireAuth, (req, res) => {
    const authUser = req.authUser;
    const currentSessionId = req.sessionId;
    if (!authUser || !currentSessionId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const revoked = deleteOtherUserSessions(authUser.id, currentSessionId);
    res.json({ revoked });
  });

  return router;
}
