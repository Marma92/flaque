import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import multer from "multer";
import { Router } from "express";
import sharp from "sharp";

import {
  countUsersByRole,
  createUser,
  deleteUserById,
  findUserById,
  findUserByUsername,
  listUsers,
  updateUserEmail,
  updateUserPassword,
  updateUserRole,
  updateUserUsername
} from "../auth/db";
import { requireAdmin, requireAuth } from "../auth/middleware";
import { verifyPassword } from "../auth/password";
import { getSessionTtlMs, setSessionCookie } from "../auth/session";
import { createSession } from "../auth/sessionDb";
import type { UserRole } from "../types/auth";
import { ensureDir, fileExists } from "../utils/fs";
import { createLogger } from "../utils/logger";
import { usersStorageRoot } from "../utils/paths";
import {
  normalizeOptionalString,
  parseRole,
  validateEmail,
  validatePassword,
  validateUsername
} from "../utils/validation";
import { getClientIp, hasOwnProperty, isSqliteUniqueError } from "./requestHelpers";

const log = createLogger("auth");

function emitSecurityAuditLog(level: "info" | "warn", event: string, details: Record<string, string | number | boolean>): void {
  log[level](event, details);
}

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

    const passwordError = validatePassword(nextPassword);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
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
      emitSecurityAuditLog("warn", "user-password-change-failed", {
        userId: authUser.id,
        reason: "invalid-current-password",
        ip: getClientIp(req) ?? "unknown"
      });
      res.status(401).json({ error: "Current password is invalid" });
      return;
    }

    const updated = updateUserPassword(authUser.id, nextPassword);
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    emitSecurityAuditLog("info", "user-password-changed", {
      userId: authUser.id,
      ip: getClientIp(req) ?? "unknown"
    });

    const newSession = createSession({
      userId: authUser.id,
      ttlMs: getSessionTtlMs(),
      userAgent: req.get("user-agent"),
      ipAddress: getClientIp(req)
    });
    setSessionCookie(res, newSession.id, newSession.expiresAt);

    res.json({ ok: true });
  });

  router.post("/users/me/email", requireAuth, (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const email = normalizeOptionalString(req.body?.email) ?? "";
      const emailError = validateEmail(email);
      if (emailError) {
        res.status(400).json({ error: emailError });
        return;
      }

      const updated = updateUserEmail(authUser.id, email);
      if (!updated) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      emitSecurityAuditLog("info", "user-email-changed", {
        userId: authUser.id,
        ip: getClientIp(req) ?? "unknown"
      });

      const updatedUser = findUserById(authUser.id);
      res.json({ ok: true, user: updatedUser });
    } catch (error) {
      if (isSqliteUniqueError(error)) {
        res.status(409).json({ error: "Email address already in use" });
        return;
      }
      next(error);
    }
  });

  router.get("/users", requireAuth, requireAdmin, (_req, res) => {
    res.json({ users: listUsers() });
  });

  router.post("/users", requireAuth, requireAdmin, (req, res, next) => {
    try {
      const username = normalizeOptionalString(req.body?.username) ?? "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const email = normalizeOptionalString(req.body?.email) ?? "";
      const role = parseRole(req.body?.role, "user");

      const usernameError = validateUsername(username);
      if (usernameError) {
        res.status(400).json({ error: usernameError });
        return;
      }

      const passwordError = validatePassword(password);
      if (passwordError) {
        res.status(400).json({ error: passwordError });
        return;
      }

      const emailError = validateEmail(email);
      if (emailError) {
        res.status(400).json({ error: emailError });
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

      const user = createUser(username, password, role, email);

      emitSecurityAuditLog("info", "admin-user-created", {
        adminUserId: req.authUser!.id,
        createdUserId: user.id,
        createdUsername: user.username,
        createdRole: user.role,
        ip: getClientIp(req) ?? "unknown"
      });

      res.status(201).json({ user });
    } catch (error) {
      if (isSqliteUniqueError(error)) {
        const errorMessage = (error as Error).message ?? "";
        if (errorMessage.includes("email")) {
          res.status(409).json({ error: "Email address already in use" });
          return;
        }
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
      const hasEmail = hasOwnProperty(req.body, "email");

      if (!hasUsername && !hasRole && !hasEmail) {
        res.status(400).json({ error: "At least one field must be provided: username, role, or email" });
        return;
      }

      let nextUsername: string | undefined;
      if (hasUsername) {
        const parsedUsername = normalizeOptionalString(req.body?.username);
        if (!parsedUsername) {
          res.status(400).json({ error: "username must be a string" });
          return;
        }

        const usernameError = validateUsername(parsedUsername);
        if (usernameError) {
          res.status(400).json({ error: usernameError });
          return;
        }

        nextUsername = parsedUsername;
      }

      let nextRole: UserRole | undefined;
      if (hasRole) {
        nextRole = parseRole(req.body?.role) ?? undefined;
        if (!nextRole) {
          res.status(400).json({ error: "Role must be either user or admin" });
          return;
        }
      }

      let nextEmail: string | undefined;
      if (hasEmail) {
        const parsedEmail = normalizeOptionalString(req.body?.email);
        if (!parsedEmail) {
          res.status(400).json({ error: "email must be a string" });
          return;
        }

        const emailError = validateEmail(parsedEmail);
        if (emailError) {
          res.status(400).json({ error: emailError });
          return;
        }

        nextEmail = parsedEmail;
      }

      const existingUser = findUserById(userId);
      if (!existingUser) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const shouldChangeUsername =
        typeof nextUsername === "string" && nextUsername !== existingUser.username;
      const shouldChangeRole = typeof nextRole === "string" && nextRole !== existingUser.role;
      const shouldChangeEmail = typeof nextEmail === "string" && nextEmail.toLowerCase() !== (existingUser.email ?? "").toLowerCase();

      if (!shouldChangeUsername && !shouldChangeRole && !shouldChangeEmail) {
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

      if (shouldChangeEmail && nextEmail) {
        const updated = updateUserEmail(userId, nextEmail);
        if (!updated) {
          res.status(404).json({ error: "User not found" });
          return;
        }
      }

      emitSecurityAuditLog("info", "admin-user-updated", {
        adminUserId: req.authUser!.id,
        targetUserId: userId,
        usernameChanged: shouldChangeUsername,
        roleChanged: shouldChangeRole,
        emailChanged: shouldChangeEmail,
        ip: getClientIp(req) ?? "unknown"
      });

      const updatedUser = findUserById(userId);
      if (!updatedUser) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({ user: updatedUser });
    } catch (error) {
      if (isSqliteUniqueError(error)) {
        const errorMessage = (error as Error).message ?? "";
        if (errorMessage.includes("email")) {
          res.status(409).json({ error: "Email address already in use" });
          return;
        }
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

    const passwordError = validatePassword(password);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
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

    emitSecurityAuditLog("info", "admin-user-password-reset", {
      adminUserId: req.authUser!.id,
      targetUserId: userId,
      targetUsername: existingUser.username,
      ip: getClientIp(req) ?? "unknown"
    });

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

    emitSecurityAuditLog("info", "admin-user-deleted", {
      adminUserId: req.authUser!.id,
      deletedUserId: userId,
      deletedUsername: existingUser.username,
      ip: getClientIp(req) ?? "unknown"
    });

    res.status(204).send();
  });

  return router;
}
