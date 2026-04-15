import type { AuthUser } from "../types/auth";

import {
  createUser,
  listUsers
} from "./db";

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin";
const DEFAULT_ADMIN_EMAIL = "admin@localhost";

export function ensureDefaultAdmin(): AuthUser | null {
  if (listUsers().length > 0) {
    return null;
  }

  return createUser(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD, "admin", DEFAULT_ADMIN_EMAIL);
}
