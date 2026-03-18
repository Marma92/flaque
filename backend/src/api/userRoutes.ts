import { Router } from "express";

import {
  countUsersByRole,
  createUser,
  deleteUserById,
  findUserById,
  findUserByUsername,
  listUsers,
  updateUserPassword
} from "../auth/db";
import { requireAdmin, requireAuth } from "../auth/middleware";
import type { UserRole } from "../types/library";

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 256;

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

      if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
        res.status(400).json({
          error: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`
        });
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

  router.post("/users/:id/reset-password", requireAuth, requireAdmin, (req, res) => {
    const userId = req.params.id;
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!userId) {
      res.status(400).json({ error: "User id is required" });
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      res.status(400).json({
        error: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`
      });
      return;
    }

    const existingUser = findUserById(userId);
    if (!existingUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const updated = updateUserPassword(userId, password);
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      ok: true,
      user: {
        id: existingUser.id,
        username: existingUser.username,
        role: existingUser.role
      }
    });
  });

  router.delete("/users/:id", requireAuth, requireAdmin, (req, res) => {
    const userId = req.params.id;

    if (!userId) {
      res.status(400).json({ error: "User id is required" });
      return;
    }

    if (req.authUser?.id === userId) {
      res.status(400).json({ error: "You cannot delete your own account" });
      return;
    }

    const existingUser = findUserById(userId);
    if (!existingUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (existingUser.role === "admin" && countUsersByRole("admin") <= 1) {
      res.status(400).json({ error: "Cannot delete the last admin account" });
      return;
    }

    const deleted = deleteUserById(userId);
    if (!deleted) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(204).send();
  });

  return router;
}
