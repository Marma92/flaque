import { Router } from "express";

import { requireAuth } from "../auth/middleware";
import {
  createSession,
  deleteSession,
  findUserByUsername
} from "../auth/db";
import { verifyPassword } from "../auth/password";
import {
  clearSessionCookie,
  getSessionTtlMs,
  setSessionCookie
} from "../auth/session";

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

    const session = createSession(user.id, getSessionTtlMs());
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

  return router;
}
