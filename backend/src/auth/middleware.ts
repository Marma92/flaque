import type { NextFunction, Request, Response } from "express";

import { findSessionUser } from "./db";
import { clearSessionCookie, SESSION_COOKIE_NAME } from "./session";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (!sessionId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const session = findSessionUser(sessionId);
  if (!session) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Session expired" });
    return;
  }

  req.authUser = session.user;
  req.sessionId = session.sessionId;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (req.authUser.role !== "admin") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }

  next();
}
