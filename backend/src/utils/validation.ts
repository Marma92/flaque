import fs from "node:fs";
import path from "node:path";

import type { UserRole } from "../types/auth";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

const HAS_LETTER = /[a-zA-Z]/;
const HAS_DIGIT = /\d/;

let commonPasswords: Set<string> | undefined;

function loadCommonPasswords(): Set<string> {
  if (commonPasswords) {
    return commonPasswords;
  }

  try {
    const filePath = path.join(__dirname, "common-passwords.txt");
    const content = fs.readFileSync(filePath, "utf8");
    commonPasswords = new Set(
      content
        .split("\n")
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean)
    );
  } catch {
    commonPasswords = new Set();
  }

  return commonPasswords;
}

export function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function parseBooleanField(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`;
  }

  if (!HAS_LETTER.test(password) || !HAS_DIGIT.test(password)) {
    return "Password must contain at least one letter and one digit";
  }

  if (loadCommonPasswords().has(password.toLowerCase())) {
    return "This password is too common, please choose a more unique password";
  }

  return null;
}

export function validateUsername(username: string): string | null {
  if (
    username.length < USERNAME_MIN_LENGTH ||
    username.length > USERNAME_MAX_LENGTH ||
    !USERNAME_PATTERN.test(username)
  ) {
    return `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} chars and contain only letters, numbers, ., _, -`;
  }

  return null;
}

export function validateEmail(email: string): string | null {
  if (!email || !email.includes("@")) {
    return "A valid email address is required";
  }

  return null;
}

export function parseRole(value: unknown, defaultRole?: UserRole): UserRole | null {
  if (value === undefined || value === null || value === "") {
    return defaultRole ?? null;
  }

  if (value === "user" || value === "admin") {
    return value;
  }

  return null;
}
