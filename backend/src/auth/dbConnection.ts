import { createHash } from "node:crypto";

import Database from "better-sqlite3";

import type { AuthSession, UserRole } from "../types/auth";
import { usersDbPath } from "../utils/paths";

export type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  email: string | null;
};

export type SessionUserRow = {
  user_id: string;
  id: string;
  username: string;
  role: UserRole;
  session_id: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
  user_agent: string | null;
  ip_address: string | null;
  label: string | null;
};

export type SessionRow = {
  id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
  user_agent: string | null;
  ip_address: string | null;
  label: string | null;
};

export type PasswordResetTokenRow = {
  id: string;
  user_id: string;
  expires_at: number;
  used_at: number | null;
};

type TableColumnRow = {
  name: string;
};

type PublicUserRow = {
  id: string;
  username: string;
  role: UserRole;
};

export type CountRow = {
  count: number;
};

let db: Database.Database | null = null;
export const SESSION_HEARTBEAT_INTERVAL_MS = 60 * 1000;

export function requireDb(): Database.Database {
  if (!db) {
    throw new Error("Auth database has not been initialized");
  }
  return db;
}

export function normalizeSessionText(value: string | null | undefined, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return null;
  }

  return normalized.slice(0, 320);
}

export function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function mapSessionRowToAuthSession(row: SessionRow): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    userAgent: row.user_agent,
    ipAddress: row.ip_address,
    label: row.label
  };
}

function hasTableColumn(database: Database.Database, tableName: string, columnName: string): boolean {
  const rows = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as TableColumnRow[];
  return rows.some((row) => row.name === columnName);
}

function ensureUserSchemaMigrations(database: Database.Database): void {
  if (!hasTableColumn(database, "users", "email")) {
    database.exec("ALTER TABLE users ADD COLUMN email TEXT");
  }

  database.exec("UPDATE users SET email = NULL WHERE TRIM(COALESCE(email, '')) = ''");
  database.exec("UPDATE users SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL");
}

function ensureSessionSchemaMigrations(database: Database.Database): void {
  if (!hasTableColumn(database, "sessions", "last_seen_at")) {
    database.exec("ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER");
  }

  if (!hasTableColumn(database, "sessions", "user_agent")) {
    database.exec("ALTER TABLE sessions ADD COLUMN user_agent TEXT");
  }

  if (!hasTableColumn(database, "sessions", "ip_address")) {
    database.exec("ALTER TABLE sessions ADD COLUMN ip_address TEXT");
  }

  if (!hasTableColumn(database, "sessions", "label")) {
    database.exec("ALTER TABLE sessions ADD COLUMN label TEXT");
  }

  database.exec("UPDATE sessions SET last_seen_at = COALESCE(last_seen_at, created_at)");
}

export function initializeAuthDatabase(): void {
  db = new Database(usersDbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      label TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER,
      requested_ip TEXT,
      requested_user_agent TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  ensureUserSchemaMigrations(db);
  ensureSessionSchemaMigrations(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON sessions(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
  `);
}
