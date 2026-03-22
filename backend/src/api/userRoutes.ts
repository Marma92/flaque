import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import multer from "multer";
import { Router, type Request } from "express";
import sharp from "sharp";

import {
  createSession,
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
import { verifyPassword } from "../auth/password";
import { getSessionTtlMs, setSessionCookie } from "../auth/session";
import type { UserRole } from "../types/auth";
import { ensureDir, fileExists } from "../utils/fs";
import { usersStorageRoot } from "../utils/paths";

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 256;
const PROFILE_DIR_NAME = "profile";
const PROFILE_PHOTO_BASE_NAME = "avatar";
const PROFILE_PHOTO_FILE_NAME = `${PROFILE_PHOTO_BASE_NAME}.webp`;
const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_PHOTO_EXTENSIONS = [".webp", ".jpg", ".jpeg", ".png", ".gif", ".avif"];

const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: PROFILE_PHOTO_MAX_BYTES,
    files: 1
  }
});

function getUserProfileDir(userId: string): string {
  return path.join(usersStorageRoot, userId, PROFILE_DIR_NAME);
}

async function resolveUserProfilePhotoPath(userId: string): Promise<string | null> {
  const profileDir = getUserProfileDir(userId);

  const preferred = path.join(profileDir, PROFILE_PHOTO_FILE_NAME);
  if (await fileExists(preferred)) {
    return preferred;
  }

  for (const extension of PROFILE_PHOTO_EXTENSIONS) {
    const candidate = path.join(profileDir, `${PROFILE_PHOTO_BASE_NAME}${extension}`);
    const exists = await fileExists(candidate);
    if (exists) {
      return candidate;
    }
  }

  return null;
}

async function removeExistingProfilePhotos(userId: string): Promise<void> {
  const profileDir = getUserProfileDir(userId);

  let entries: Dirent[];
  try {
    entries = await fs.readdir(profileDir, { withFileTypes: true });
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(`${PROFILE_PHOTO_BASE_NAME}.`))
      .map((entry) => fs.unlink(path.join(profileDir, entry.name)))
  );
}

async function convertProfilePhotoToWebp(source: Buffer): Promise<Buffer> {
  return sharp(source)
    .rotate()
    .resize(320, 320, {
      fit: "cover",
      position: "centre"
    })
    .webp({ quality: 90 })
    .toBuffer();
}

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

function isSqliteUniqueError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /unique/i.test(error.message);
}

export function createUserRouter(): Router {
  const router = Router();

  router.get("/users/me/photo", requireAuth, async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
      res.setHeader("Vary", "Cookie");

      const profilePhotoPath = await resolveUserProfilePhotoPath(authUser.id);
      if (!profilePhotoPath) {
        res.status(404).json({ error: "Profile photo not found" });
        return;
      }

      res.sendFile(profilePhotoPath);
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/me/photo", requireAuth, (req, res, next) => {
    profilePhotoUpload.single("photo")(req, res, (error: unknown) => {
      if (error) {
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: `Profile photo must be <= ${Math.floor(PROFILE_PHOTO_MAX_BYTES / (1024 * 1024))} MB` });
          return;
        }

        next(error);
        return;
      }

      void (async () => {
        const authUser = req.authUser;
        if (!authUser) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "photo file is required" });
          return;
        }

        if (!file.mimetype.toLowerCase().startsWith("image/")) {
          res.status(400).json({ error: "Unsupported image format" });
          return;
        }

        let convertedBuffer: Buffer;
        try {
          convertedBuffer = await convertProfilePhotoToWebp(file.buffer);
        } catch {
          res.status(400).json({ error: "Invalid image file" });
          return;
        }

        const profileDir = getUserProfileDir(authUser.id);
        await ensureDir(profileDir);

        const tmpPath = path.join(profileDir, `profile-photo-upload.${process.pid}.${Date.now()}.tmp`);
        const targetPath = path.join(profileDir, PROFILE_PHOTO_FILE_NAME);

        await fs.writeFile(tmpPath, convertedBuffer);
        await removeExistingProfilePhotos(authUser.id);
        await fs.rename(tmpPath, targetPath);

        res.json({ ok: true });
      })().catch(next);
    });
  });

  router.post("/users/me/password", requireAuth, (req, res) => {
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const nextPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

    if (currentPassword.length === 0) {
      res.status(400).json({ error: "currentPassword is required" });
      return;
    }

    if (nextPassword.length < PASSWORD_MIN_LENGTH || nextPassword.length > PASSWORD_MAX_LENGTH) {
      res.status(400).json({
        error: `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`
      });
      return;
    }

    if (currentPassword === nextPassword) {
      res.status(400).json({ error: "New password must be different from the current password" });
      return;
    }

    const authUser = req.authUser;
    if (!authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const existingUser = findUserByUsername(authUser.username);
    if (!existingUser || !verifyPassword(currentPassword, existingUser.password_hash)) {
      res.status(401).json({ error: "Current password is invalid" });
      return;
    }

    const updated = updateUserPassword(authUser.id, nextPassword);
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const newSession = createSession({
      userId: authUser.id,
      ttlMs: getSessionTtlMs(),
      userAgent: req.get("user-agent"),
      ipAddress: getClientIp(req)
    });
    setSessionCookie(res, newSession.id, newSession.expiresAt);

    res.json({ ok: true });
  });

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
