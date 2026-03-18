import { Router } from "express";

import { createUser, findUserByUsername, listUsers } from "../auth/db";
import { requireAdmin, requireAuth } from "../auth/middleware";
import type { UserRole } from "../types/library";

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

function parseRole(value: unknown): UserRole | null {
  if (value === undefined || value === null || value === "") {
    return "user";
  }

  if (value === "user" || value === "admin") {
    return value;
  }

  return null;
}

function isSqliteUniqueError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /unique/i.test(error.message);
}

export function createUserRouter(): Router {
  const router = Router();

  router.get("/users", requireAuth, requireAdmin, (_req, res) => {
    res.json({ users: listUsers() });
  });

  router.post("/users", requireAuth, requireAdmin, (req, res, next) => {
    try {
      const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const role = parseRole(req.body?.role);

      if (username.length < 3 || username.length > 32 || !USERNAME_PATTERN.test(username)) {
        res.status(400).json({
          error: "Username must be 3-32 chars and contain only letters, numbers, ., _, -"
        });
        return;
      }

      if (password.length < 8 || password.length > 256) {
        res.status(400).json({ error: "Password must be between 8 and 256 characters" });
        return;
      }

      if (!role) {
        res.status(400).json({ error: "Role must be either user or admin" });
        return;
      }

      const existing = findUserByUsername(username);
      if (existing) {
        res.status(409).json({ error: "Username already exists" });
        return;
      }

      const user = createUser(username, password, role);
      res.status(201).json({ user });
    } catch (error) {
      if (isSqliteUniqueError(error)) {
        res.status(409).json({ error: "Username already exists" });
        return;
      }

      next(error);
    }
  });

  return router;
}
