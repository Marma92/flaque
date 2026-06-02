import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import multer from "multer";
import { Router } from "express";
import sharp from "sharp";

import { isSupportedLanguage } from "@flaque/shared";

import {
  countUsersByRole,
  createUser,
  deleteUserById,
  findUserById,
  findUserByUsername,
  listUsers,
  setUserLanguage,
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
import { AppError } from "../utils/AppError";
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

function emitSecurityAuditLog(
  level: "info" | "warn",
  event: string,
  message: string,
  details: Record<string, string | number | boolean>
): void {
  log[level](message, { event, ...details });
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
        return next(new AppError("Unauthorized", 401));
      }

      res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
      res.setHeader("Vary", "Cookie");

      const profilePhotoPath = await resolveUserProfilePhotoPath(authUser.id);
      if (!profilePhotoPath) {
        return next(new AppError("Profile photo not found", 404));
      }

      res.sendFile(profilePhotoPath);
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/me/photo", requireAuth, async (req, res, next) => {
    try {
      await new Promise<void>((resolve, reject) => {
        profilePhotoUpload.single("photo")(req, res, (err: unknown) => (err ? reject(err) : resolve()));
      });
    } catch (error) {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        return next(new AppError(`Profile photo must be <= ${Math.floor(PROFILE_PHOTO_MAX_BYTES / (1024 * 1024))} MB`, 400));
      }
      next(error);
      return;
    }

    try {
      const authUser = req.authUser;
      if (!authUser) {
        return next(new AppError("Unauthorized", 401));
      }

      const file = req.file;
      if (!file) {
        return next(new AppError("photo file is required", 400));
      }

      if (!file.mimetype.toLowerCase().startsWith("image/")) {
        return next(new AppError("Unsupported image format", 400));
      }

      let convertedBuffer: Buffer;
      try {
        convertedBuffer = await convertProfilePhotoToWebp(file.buffer);
      } catch {
        return next(new AppError("Invalid image file", 400));
      }

      const profileDir = getUserProfileDir(authUser.id);
      await ensureDir(profileDir);

      const tmpPath = path.join(profileDir, `profile-photo-upload.${process.pid}.${Date.now()}.tmp`);
      const targetPath = path.join(profileDir, PROFILE_PHOTO_FILE_NAME);

      await fs.writeFile(tmpPath, convertedBuffer);
      await removeExistingProfilePhotos(authUser.id);
      await fs.rename(tmpPath, targetPath);

      emitSecurityAuditLog("info", "user-profile-photo-updated", "User updated profile photo", {
        userId: authUser.id,
        username: authUser.username,
        originalName: file.originalname ?? "unknown",
        sizeBytes: file.size
      });

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/me/password", requireAuth, (req, res, next) => {
    const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const nextPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

    if (currentPassword.length === 0) {
      return next(new AppError("currentPassword is required", 400));
    }

    const passwordError = validatePassword(nextPassword);
    if (passwordError) {
      return next(new AppError(passwordError, 400));
    }

    if (currentPassword === nextPassword) {
      return next(new AppError("New password must be different from the current password", 400));
    }

    const authUser = req.authUser;
    if (!authUser) {
      return next(new AppError("Unauthorized", 401));
    }

    const existingUser = findUserByUsername(authUser.username);
    if (!existingUser || !verifyPassword(currentPassword, existingUser.password_hash)) {
      emitSecurityAuditLog("warn", "user-password-change-failed", "User password change failed", {
        userId: authUser.id,
        username: authUser.username,
        reason: "invalid-current-password",
        ip: getClientIp(req) ?? "unknown"
      });
      return next(new AppError("Current password is invalid", 401));
    }

    const updated = updateUserPassword(authUser.id, nextPassword);
    if (!updated) {
      return next(new AppError("User not found", 404));
    }

    emitSecurityAuditLog("info", "user-password-changed", "User changed password", {
      userId: authUser.id,
      username: authUser.username,
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
        return next(new AppError("Unauthorized", 401));
      }

      const email = normalizeOptionalString(req.body?.email) ?? "";
      const emailError = validateEmail(email);
      if (emailError) {
        return next(new AppError(emailError, 400));
      }

      const updated = updateUserEmail(authUser.id, email);
      if (!updated) {
        return next(new AppError("User not found", 404));
      }

      emitSecurityAuditLog("info", "user-email-changed", "User changed email", {
        userId: authUser.id,
        username: authUser.username,
        ip: getClientIp(req) ?? "unknown"
      });

      const updatedUser = findUserById(authUser.id);
      res.json({ ok: true, user: updatedUser });
    } catch (error) {
      if (isSqliteUniqueError(error)) {
        return next(new AppError("Email address already in use", 409));
      }
      next(error);
    }
  });

  router.post("/users/me/language", requireAuth, (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        return next(new AppError("Unauthorized", 401));
      }

      const language = req.body?.language;
      if (!isSupportedLanguage(language)) {
        return next(new AppError("Unsupported language", 400));
      }

      const updated = setUserLanguage(authUser.id, language);
      if (!updated) {
        return next(new AppError("User not found", 404));
      }

      const updatedUser = findUserById(authUser.id);
      res.json({ ok: true, user: updatedUser });
    } catch (error) {
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
        return next(new AppError(usernameError, 400));
      }

      const passwordError = validatePassword(password);
      if (passwordError) {
        return next(new AppError(passwordError, 400));
      }

      const emailError = validateEmail(email);
      if (emailError) {
        return next(new AppError(emailError, 400));
      }

      if (!role) {
        return next(new AppError("Role must be either user or admin", 400));
      }

      const existing = findUserByUsername(username);
      if (existing) {
        return next(new AppError("Username already exists", 409));
      }

      const user = createUser(username, password, role, email);

      emitSecurityAuditLog("info", "admin-user-created", `Admin created user "${user.username}"`, {
        adminUserId: req.authUser!.id,
        adminUsername: req.authUser!.username,
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
          return next(new AppError("Email address already in use", 409));
        }
        return next(new AppError("Username already exists", 409));
      }

      next(error);
    }
  });

  router.patch("/users/:id", requireAuth, requireAdmin, (req, res, next) => {
    try {
      const userId = req.params.id;

      if (!userId) {
        return next(new AppError("User id is required", 400));
      }

      const hasUsername = hasOwnProperty(req.body, "username");
      const hasRole = hasOwnProperty(req.body, "role");
      const hasEmail = hasOwnProperty(req.body, "email");

      if (!hasUsername && !hasRole && !hasEmail) {
        return next(new AppError("At least one field must be provided: username, role, or email", 400));
      }

      let nextUsername: string | undefined;
      if (hasUsername) {
        const parsedUsername = normalizeOptionalString(req.body?.username);
        if (!parsedUsername) {
          return next(new AppError("username must be a string", 400));
        }

        const usernameError = validateUsername(parsedUsername);
        if (usernameError) {
          return next(new AppError(usernameError, 400));
        }

        nextUsername = parsedUsername;
      }

      let nextRole: UserRole | undefined;
      if (hasRole) {
        nextRole = parseRole(req.body?.role) ?? undefined;
        if (!nextRole) {
          return next(new AppError("Role must be either user or admin", 400));
        }
      }

      let nextEmail: string | undefined;
      if (hasEmail) {
        const parsedEmail = normalizeOptionalString(req.body?.email);
        if (!parsedEmail) {
          return next(new AppError("email must be a string", 400));
        }

        const emailError = validateEmail(parsedEmail);
        if (emailError) {
          return next(new AppError(emailError, 400));
        }

        nextEmail = parsedEmail;
      }

      const existingUser = findUserById(userId);
      if (!existingUser) {
        return next(new AppError("User not found", 404));
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
          return next(new AppError("Username already exists", 409));
        }
      }

      if (existingUser.role === "admin" && nextRole === "user" && countUsersByRole("admin") <= 1) {
        return next(new AppError("Cannot demote the last admin account", 400));
      }

      if (shouldChangeUsername && nextUsername) {
        const updated = updateUserUsername(userId, nextUsername);
        if (!updated) {
          return next(new AppError("User not found", 404));
        }
      }

      if (shouldChangeRole && nextRole) {
        const updated = updateUserRole(userId, nextRole);
        if (!updated) {
          return next(new AppError("User not found", 404));
        }
      }

      if (shouldChangeEmail && nextEmail) {
        const updated = updateUserEmail(userId, nextEmail);
        if (!updated) {
          return next(new AppError("User not found", 404));
        }
      }

      const changedFields = [
        shouldChangeUsername && "username",
        shouldChangeRole && "role",
        shouldChangeEmail && "email"
      ].filter(Boolean).join(", ");
      const targetLabel = nextUsername ?? existingUser.username;

      emitSecurityAuditLog("info", "admin-user-updated", `Admin updated user "${targetLabel}" (${changedFields})`, {
        adminUserId: req.authUser!.id,
        adminUsername: req.authUser!.username,
        targetUserId: userId,
        targetUsername: existingUser.username,
        usernameChanged: shouldChangeUsername,
        ...(shouldChangeUsername ? { oldUsername: existingUser.username, newUsername: nextUsername! } : {}),
        roleChanged: shouldChangeRole,
        ...(shouldChangeRole ? { oldRole: existingUser.role, newRole: nextRole! } : {}),
        emailChanged: shouldChangeEmail,
        ...(shouldChangeEmail ? { newEmail: nextEmail! } : {}),
        ip: getClientIp(req) ?? "unknown"
      });

      const updatedUser = findUserById(userId);
      if (!updatedUser) {
        return next(new AppError("User not found", 404));
      }

      res.json({ user: updatedUser });
    } catch (error) {
      if (isSqliteUniqueError(error)) {
        const errorMessage = (error as Error).message ?? "";
        if (errorMessage.includes("email")) {
          return next(new AppError("Email address already in use", 409));
        }
        return next(new AppError("Username already exists", 409));
      }

      next(error);
    }
  });

  router.post("/users/:id/reset-password", requireAuth, requireAdmin, (req, res, next) => {
    const userId = req.params.id;
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!userId) {
      return next(new AppError("User id is required", 400));
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return next(new AppError(passwordError, 400));
    }

    const existingUser = findUserById(userId);
    if (!existingUser) {
      return next(new AppError("User not found", 404));
    }

    const updated = updateUserPassword(userId, password);
    if (!updated) {
      return next(new AppError("User not found", 404));
    }

    emitSecurityAuditLog("info", "admin-user-password-reset", `Admin reset password for user "${existingUser.username}"`, {
      adminUserId: req.authUser!.id,
      adminUsername: req.authUser!.username,
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

  router.delete("/users/:id", requireAuth, requireAdmin, (req, res, next) => {
    const userId = req.params.id;

    if (!userId) {
      return next(new AppError("User id is required", 400));
    }

    if (req.authUser?.id === userId) {
      return next(new AppError("You cannot delete your own account", 400));
    }

    const existingUser = findUserById(userId);
    if (!existingUser) {
      return next(new AppError("User not found", 404));
    }

    if (existingUser.role === "admin" && countUsersByRole("admin") <= 1) {
      return next(new AppError("Cannot delete the last admin account", 400));
    }

    const deleted = deleteUserById(userId);
    if (!deleted) {
      return next(new AppError("User not found", 404));
    }

    emitSecurityAuditLog("info", "admin-user-deleted", `Admin deleted user "${existingUser.username}"`, {
      adminUserId: req.authUser!.id,
      adminUsername: req.authUser!.username,
      deletedUserId: userId,
      deletedUsername: existingUser.username,
      ip: getClientIp(req) ?? "unknown"
    });

    res.status(204).send();
  });

  return router;
}
