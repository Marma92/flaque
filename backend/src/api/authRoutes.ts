import { Router, type Request } from "express";

import { requireAuth } from "../auth/middleware";
import {
  createSession,
  deleteOtherUserSessions,
  deleteSessionForUser,
  deleteSession,
  findUserByUsername,
  listSessionsByUserId
} from "../auth/db";
import { verifyPassword } from "../auth/password";
import {
  clearSessionCookie,
  getSessionTtlMs,
  setSessionCookie
} from "../auth/session";

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

export function createAuthRouter(): Router {
  const router = Router();

  router.post("/login", (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!username || !password) {
      res.status(400).json({ error: "username and password are required" });
      return;
    }

    const user = findUserByUsername(username);
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
