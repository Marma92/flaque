import type { AuthUser, UserRole } from "../types/auth";
import { createId } from "../utils/hash";
import { hashPassword } from "./password";

import { requireDb, normalizeEmail } from "./dbConnection";
import type { UserRow, CountRow } from "./dbConnection";
import { revokeSessionsByUserId } from "./sessionDb";

// Re-export everything from sub-modules so existing consumers continue to work
export * from "./dbConnection";
export * from "./sessionDb";
export * from "./passwordResetDb";
export * from "./bootstrap";

export function createUser(
  username: string,
  password: string,
  role: UserRole = "user",
  email: string
): AuthUser {
  const database = requireDb();
  const id = createId(16);
  const now = Date.now();
  const passwordHash = hashPassword(password);
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new Error("A valid email address is required");
  }

  database
    .prepare(
      "INSERT INTO users (id, username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(id, username, normalizedEmail, passwordHash, role, now);

  return { id, username, role, email: normalizedEmail };
}

export function findUserByUsername(username: string): UserRow | null {
  const database = requireDb();
  const row = database
    .prepare("SELECT id, username, email, password_hash, role FROM users WHERE username = ?")
    .get(username) as UserRow | undefined;
  return row ?? null;
}

export function findUserByEmail(email: string): UserRow | null {
  const database = requireDb();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const row = database
    .prepare("SELECT id, username, email, password_hash, role FROM users WHERE email = ?")
    .get(normalizedEmail) as UserRow | undefined;
  return row ?? null;
}

export function findUserByLogin(login: string): UserRow | null {
  const normalizedLogin = login.trim();
  if (!normalizedLogin) {
    return null;
  }

  const byUsername = findUserByUsername(normalizedLogin);
  if (byUsername) {
    return byUsername;
  }

  return findUserByEmail(normalizedLogin);
}

export function findUserById(userId: string): AuthUser | null {
  const database = requireDb();
  const row = database
    .prepare("SELECT id, username, COALESCE(email, '') AS email, role FROM users WHERE id = ?")
    .get(userId) as AuthUser | undefined;
  return row ?? null;
}

export function listUsers(): AuthUser[] {
  const database = requireDb();
  return database
    .prepare("SELECT id, username, COALESCE(email, '') AS email, role FROM users ORDER BY username ASC")
    .all() as AuthUser[];
}

export function countUsersByRole(role: UserRole): number {
  const database = requireDb();
  const row = database
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = ?")
    .get(role) as CountRow;
  return row.count;
}

export function updateUserPassword(userId: string, password: string): boolean {
  const database = requireDb();
  const passwordHash = hashPassword(password);
  const result = database
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(passwordHash, userId);

  if (result.changes > 0) {
    revokeSessionsByUserId(userId);
    return true;
  }

  return false;
}

export function deleteUserById(userId: string): boolean {
  const database = requireDb();
  const result = database.prepare("DELETE FROM users WHERE id = ?").run(userId);
  return result.changes > 0;
}

export function updateUserUsername(userId: string, username: string): boolean {
  const database = requireDb();
  const result = database.prepare("UPDATE users SET username = ? WHERE id = ?").run(username, userId);
  return result.changes > 0;
}

export function updateUserRole(userId: string, role: UserRole): boolean {
  const database = requireDb();
  const result = database.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
  return result.changes > 0;
}

export function updateUserEmail(userId: string, email: string | null | undefined): boolean {
  const database = requireDb();
  const normalizedEmail = normalizeEmail(email);
  const result = database.prepare("UPDATE users SET email = ? WHERE id = ?").run(normalizedEmail, userId);
  return result.changes > 0;
}
