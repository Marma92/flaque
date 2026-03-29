import type { UserRole } from "../types/auth";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

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
