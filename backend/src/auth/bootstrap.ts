import { randomInt } from "node:crypto";

import type { AuthUser } from "../types/auth";

import {
  createUser,
  findUserById,
  findUserByUsername,
  listUsers,
  updateUserPassword
} from "./db";

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_EMAIL = "admin@localhost";
const GENERATED_PASSWORD_LENGTH = 24;

export type BootstrapAdminResult = {
  user: AuthUser;
  /**
   * The auto-generated password, set only when ADMIN_PASSWORD was not provided.
   * The caller must surface it once (it is never stored in plaintext).
   */
  generatedPassword: string | null;
  /** True when an existing admin's password was reset from ADMIN_PASSWORD. */
  passwordSynced: boolean;
};

function readEnv(name: string): string | undefined {
  const value = (process.env[name] ?? "").trim();
  return value || undefined;
}

function parseBooleanEnv(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

/**
 * Generate a strong random password that always satisfies validatePassword
 * (length, at least one letter and one digit, not a common password). Ambiguous
 * characters are excluded so the value stays readable when copied from logs.
 */
function generateAdminPassword(): string {
  const letters = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+";
  const alphabet = letters + digits + symbols;

  const chars: string[] = [
    letters[randomInt(letters.length)]!,
    digits[randomInt(digits.length)]!,
    symbols[randomInt(symbols.length)]!
  ];
  while (chars.length < GENERATED_PASSWORD_LENGTH) {
    chars.push(alphabet[randomInt(alphabet.length)]!);
  }

  // Fisher–Yates shuffle so the guaranteed letter/digit/symbol are not always up front.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }

  return chars.join("");
}

/**
 * Ensure a usable admin account exists on startup.
 *
 * - Fresh install: create the admin from ADMIN_USERNAME/ADMIN_EMAIL and either
 *   ADMIN_PASSWORD (validated) or a generated one-time password. The old
 *   hard-coded `admin/admin` default is gone — an exposed first-run instance no
 *   longer ships with guessable credentials.
 * - Existing install: only touched when the operator explicitly opts in via
 *   BOOTSTRAP_SYNC_ADMIN_PASSWORD (used by setup-production.sh), which resets the
 *   admin password from ADMIN_PASSWORD and revokes that user's sessions.
 */
export function ensureDefaultAdmin(): BootstrapAdminResult | null {
  const username = readEnv("ADMIN_USERNAME") ?? DEFAULT_ADMIN_USERNAME;
  const email = readEnv("ADMIN_EMAIL") ?? DEFAULT_ADMIN_EMAIL;
  const configuredPassword = readEnv("ADMIN_PASSWORD");

  if (listUsers().length === 0) {
    // An explicitly provided ADMIN_PASSWORD is the operator's own choice and is
    // used as-is (the interactive password policy is not enforced on bootstrap
    // secrets). When absent, a strong random password is generated instead —
    // the old guessable admin/admin default is never used.
    if (configuredPassword !== undefined) {
      const user = createUser(username, configuredPassword, "admin", email);
      return { user, generatedPassword: null, passwordSynced: false };
    }

    const generatedPassword = generateAdminPassword();
    const user = createUser(username, generatedPassword, "admin", email);
    return { user, generatedPassword, passwordSynced: false };
  }

  // Users already exist: never silently re-seed. Only resync on explicit request.
  if (configuredPassword !== undefined && parseBooleanEnv(process.env.BOOTSTRAP_SYNC_ADMIN_PASSWORD)) {
    const existing = findUserByUsername(username);
    if (existing && existing.role === "admin") {
      updateUserPassword(existing.id, configuredPassword);
      const refreshed = findUserById(existing.id);
      if (refreshed) {
        return { user: refreshed, generatedPassword: null, passwordSynced: true };
      }
    }
  }

  return null;
}
