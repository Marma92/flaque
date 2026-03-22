import { Router, type Request } from "express";

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

    if (!login || !password) {
      res.status(400).json({ error: "login and password are required" });
      return;
    }

    const user = findUserByLogin(login);
    if (!user || !verifyPassword(password, user.password_hash)) {
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

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  });

  router.post("/forgot-password", (req, res) => {
    const login = parseLoginValue(req.body?.login ?? req.body?.username ?? req.body?.email);

    if (!login) {
      res.status(400).json({ error: "login is required" });
      return;
    }

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
      });
    }

    res.json({ ok: true });
  });

  router.post("/reset-password", (req, res) => {
    const token = parseLoginValue(req.body?.token);
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

    if (!token || !newPassword) {
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
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }

    const updated = updateUserPassword(consumedToken.userId, newPassword);
    if (!updated) {
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }

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
