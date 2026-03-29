import type { AuthUser } from "../types/auth";
import { createLogger } from "../utils/logger";

const log = createLogger("auth");

import {
  createUser,
  findUserByUsername,
  findUserById,
  updateUserRole,
  updateUserEmail,
  updateUserPassword
} from "./db";
import { normalizeEmail } from "./dbConnection";

function normalizeBootstrapAdminPassword(rawValue: string): string {
  const value = rawValue.replace(/\r$/, "");
  if (value.length < 2) {
    return value;
  }

  const quote = value[0];
  if ((quote !== "'" && quote !== '"') || value[value.length - 1] !== quote) {
    return value;
  }

  const inner = value.slice(1, -1);

  if (quote === "'") {
    return inner.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  }

  try {
    return JSON.parse(value) as string;
  } catch {
    return inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function shouldSyncBootstrapAdminPassword(): boolean {
  const flag = (process.env.BOOTSTRAP_SYNC_ADMIN_PASSWORD ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export function ensureDefaultAdmin(): AuthUser | null {
  const username = (process.env.ADMIN_USERNAME ?? "admin").trim();
  const password = normalizeBootstrapAdminPassword(process.env.ADMIN_PASSWORD ?? "admin1234");
  const adminEmail = process.env.ADMIN_EMAIL?.trim() ?? "";
  const syncBootstrapAdminPassword = shouldSyncBootstrapAdminPassword();

  if (!username) {
    return null;
  }

  const existing = findUserByUsername(username);
  if (existing) {
    if (existing.role !== "admin") {
      updateUserRole(existing.id, "admin");
    }

    const normalizedAdminEmail = normalizeEmail(adminEmail);
    if (normalizedAdminEmail && existing.email !== normalizedAdminEmail) {
      updateUserEmail(existing.id, normalizedAdminEmail);
    }

    if (syncBootstrapAdminPassword) {
      updateUserPassword(existing.id, password);
    }

    const promoted = findUserById(existing.id);
    return promoted ?? {
      id: existing.id,
      username: existing.username,
      email: existing.email ?? normalizedAdminEmail ?? "",
      role: "admin"
    };
  }

  if (!adminEmail) {
    log.warn("ADMIN_EMAIL is required to create the default admin user. Set it in your environment.");
    return null;
  }

  return createUser(username, password, "admin", adminEmail);
}
