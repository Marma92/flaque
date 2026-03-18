import { Router } from "express";

import {
  countUsersByRole,
  createUser,
  deleteUserById,
  findUserById,
  findUserByUsername,
  listUsers,
  updateUserPassword,
  updateUserRole,
  updateUserUsername
} from "../auth/db";
import { requireAdmin, requireAuth } from "../auth/middleware";
import type { UserRole } from "../types/library";

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 256;

function parseRoleForCreate(value: unknown): UserRole | null {
  if (value === undefined || value === null || value === "") {
    return "user";
  }

  if (value === "user" || value === "admin") {
    return value;
  }

  return null;
}

function parseRoleForPatch(value: unknown): UserRole | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value === "user" || value === "admin") {
    return value;
  }

  return null;
}

function hasOwnProperty(value: unknown, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value ?? {}, key);
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
      const role = parseRoleForCreate(req.body?.role);

      if (
        username.length < USERNAME_MIN_LENGTH ||
        username.length > USERNAME_MAX_LENGTH ||
        !USERNAME_PATTERN.test(username)
      ) {
        res.status(400).json({
          error: `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} chars and contain only letters, numbers, ., _, -`
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

  router.patch("/users/:id", requireAuth, requireAdmin, (req, res, next) => {
    try {
      const userId = req.params.id;

      if (!userId) {
        res.status(400).json({ error: "User id is required" });
        return;
      }

      const hasUsername = hasOwnProperty(req.body, "username");
      const hasRole = hasOwnProperty(req.body, "role");

      if (!hasUsername && !hasRole) {
        res.status(400).json({ error: "At least one field must be provided: username or role" });
        return;
      }

      let nextUsername: string | undefined;
      if (hasUsername) {
        if (typeof req.body?.username !== "string") {
          res.status(400).json({ error: "username must be a string" });
          return;
        }

        const parsedUsername = req.body.username.trim();
        if (
          parsedUsername.length < USERNAME_MIN_LENGTH ||
          parsedUsername.length > USERNAME_MAX_LENGTH ||
          !USERNAME_PATTERN.test(parsedUsername)
        ) {
          res.status(400).json({
            error: `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} chars and contain only letters, numbers, ., _, -`
          });
          return;
        }

        nextUsername = parsedUsername;
      }

      let nextRole: UserRole | undefined;
      if (hasRole) {
        nextRole = parseRoleForPatch(req.body?.role) ?? undefined;
        if (!nextRole) {
          res.status(400).json({ error: "Role must be either user or admin" });
          return;
        }
      }

      const existingUser = findUserById(userId);
      if (!existingUser) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const shouldChangeUsername =
        typeof nextUsername === "string" && nextUsername !== existingUser.username;
      const shouldChangeRole = typeof nextRole === "string" && nextRole !== existingUser.role;

      if (!shouldChangeUsername && !shouldChangeRole) {
        res.json({ user: existingUser });
        return;
      }

      if (shouldChangeUsername && nextUsername) {
        const usernameOwner = findUserByUsername(nextUsername);
        if (usernameOwner && usernameOwner.id !== existingUser.id) {
          res.status(409).json({ error: "Username already exists" });
          return;
        }
      }

      if (existingUser.role === "admin" && nextRole === "user" && countUsersByRole("admin") <= 1) {
        res.status(400).json({ error: "Cannot demote the last admin account" });
        return;
      }

      if (shouldChangeUsername && nextUsername) {
        const updated = updateUserUsername(userId, nextUsername);
        if (!updated) {
          res.status(404).json({ error: "User not found" });
          return;
        }
      }

      if (shouldChangeRole && nextRole) {
        const updated = updateUserRole(userId, nextRole);
        if (!updated) {
          res.status(404).json({ error: "User not found" });
          return;
        }
      }

      const updatedUser = findUserById(userId);
      if (!updatedUser) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({ user: updatedUser });
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
