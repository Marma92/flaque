import Database from "better-sqlite3";

import type { AuthUser, UserRole } from "../types/auth";
import { createId } from "../utils/hash";
import { usersDbPath } from "../utils/paths";
import { hashPassword, verifyPassword } from "./password";

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
};

type SessionUserRow = {
  id: string;
  username: string;
  role: UserRole;
  session_id: string;
  expires_at: number;
};

type PublicUserRow = {
  id: string;
  username: string;
  role: UserRole;
};

type CountRow = {
  count: number;
};

let db: Database.Database | null = null;

function requireDb(): Database.Database {
  if (!db) {
    throw new Error("Auth database has not been initialized");
  }
  return db;
}

export function initializeAuthDatabase(): void {
  db = new Database(usersDbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);
}

export function createUser(username: string, password: string, role: UserRole = "user"): AuthUser {
  const database = requireDb();
  const id = createId(16);
  const now = Date.now();
  const passwordHash = hashPassword(password);

  database
    .prepare(
      "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, username, passwordHash, role, now);

  return { id, username, role };
}

export function findUserByUsername(username: string): UserRow | null {
  const database = requireDb();
  const row = database
    .prepare("SELECT id, username, password_hash, role FROM users WHERE username = ?")
    .get(username) as UserRow | undefined;
  return row ?? null;
}

export function findUserById(userId: string): AuthUser | null {
  const database = requireDb();
  const row = database
    .prepare("SELECT id, username, role FROM users WHERE id = ?")
    .get(userId) as AuthUser | undefined;
  return row ?? null;
}

export function listUsers(): AuthUser[] {
  const database = requireDb();
  return database
    .prepare("SELECT id, username, role FROM users ORDER BY username ASC")
    .all() as PublicUserRow[];
}

export function countUsersByRole(role: UserRole): number {
  const database = requireDb();
  const row = database
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = ?")
    .get(role) as CountRow;
  return row.count;
}

export function revokeSessionsByUserId(userId: string): void {
  const database = requireDb();
  database.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
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

export function createSession(userId: string, ttlMs: number): { id: string; expiresAt: number } {
  const database = requireDb();
  const id = createId(24);
  const now = Date.now();
  const expiresAt = now + ttlMs;

  database
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(id, userId, expiresAt, now);

  return { id, expiresAt };
}

export function deleteSession(sessionId: string): void {
  const database = requireDb();
  database.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function deleteExpiredSessions(now = Date.now()): void {
  const database = requireDb();
  database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
}

export function findSessionUser(sessionId: string): { user: AuthUser; sessionId: string } | null {
  const database = requireDb();
  const row = database
    .prepare(
      `
      SELECT
        u.id,
        u.username,
        u.role,
        s.id AS session_id,
        s.expires_at
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
      LIMIT 1
      `
    )
    .get(sessionId) as SessionUserRow | undefined;

  if (!row) {
    return null;
  }

  if (row.expires_at <= Date.now()) {
    deleteSession(sessionId);
    return null;
  }

  return {
    user: {
      id: row.id,
      username: row.username,
      role: row.role
    },
    sessionId: row.session_id
  };
}

export function ensureDefaultAdmin(): AuthUser | null {
  const username = (process.env.ADMIN_USERNAME ?? "admin").trim();
  const password = process.env.ADMIN_PASSWORD ?? "admin1234";

  if (!username) {
    return null;
  }

  const existing = findUserByUsername(username);
  if (existing) {
    if (existing.role !== "admin") {
      updateUserRole(existing.id, "admin");
    }

    if (!verifyPassword(password, existing.password_hash)) {
      updateUserPassword(existing.id, password);
    }

    const refreshed = findUserById(existing.id);
    if (refreshed) {
      return refreshed;
    }

    return {
      id: existing.id,
      username: existing.username,
      role: "admin"
    };
  }

  return createUser(username, password, "admin");
}
