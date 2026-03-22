import { createHash } from "node:crypto";

import Database from "better-sqlite3";

import type { AuthSession, AuthUser, UserRole } from "../types/auth";
import { createId } from "../utils/hash";
import { usersDbPath } from "../utils/paths";
import { hashPassword } from "./password";

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  email: string | null;
};

type SessionUserRow = {
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

type SessionRow = {
  id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
  user_agent: string | null;
  ip_address: string | null;
  label: string | null;
};

type PasswordResetTokenRow = {
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

type CountRow = {
  count: number;
};

let db: Database.Database | null = null;
const SESSION_HEARTBEAT_INTERVAL_MS = 60 * 1000;

function requireDb(): Database.Database {
  if (!db) {
    throw new Error("Auth database has not been initialized");
  }
  return db;
}

function normalizeSessionText(value: string | null | undefined, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return null;
  }

  return normalized.slice(0, 320);
}

function hashPasswordResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function mapSessionRowToAuthSession(row: SessionRow): AuthSession {
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

export function createUser(
  username: string,
  password: string,
  role: UserRole = "user",
  email?: string | null
): AuthUser {
  const database = requireDb();
  const id = createId(16);
  const now = Date.now();
  const passwordHash = hashPassword(password);
  const normalizedEmail = normalizeEmail(email);

  database
    .prepare(
      "INSERT INTO users (id, username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(id, username, normalizedEmail, passwordHash, role, now);

  return { id, username, role };
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

export function updateUserEmail(userId: string, email: string | null | undefined): boolean {
  const database = requireDb();
  const normalizedEmail = normalizeEmail(email);
  const result = database.prepare("UPDATE users SET email = ? WHERE id = ?").run(normalizedEmail, userId);
  return result.changes > 0;
}

export function createSession(input: {
  userId: string;
  ttlMs: number;
  userAgent?: string | null;
  ipAddress?: string | null;
  label?: string | null;
}): { id: string; expiresAt: number } {
  const database = requireDb();
  const id = createId(24);
  const now = Date.now();
  const expiresAt = now + input.ttlMs;
  const userAgent = normalizeSessionText(input.userAgent, 512);
  const ipAddress = normalizeSessionText(input.ipAddress, 128);
  const label = normalizeSessionText(input.label, 128);

  database
    .prepare(
      "INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at, user_agent, ip_address, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(id, input.userId, expiresAt, now, now, userAgent, ipAddress, label);

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

export function createPasswordResetToken(input: {
  userId: string;
  ttlMs: number;
  requestedIp?: string | null;
  requestedUserAgent?: string | null;
}): { token: string; expiresAt: number } {
  const database = requireDb();
  const token = createId(32);
  const tokenHash = hashPasswordResetToken(token);
  const now = Date.now();
  const expiresAt = now + input.ttlMs;
  const requestedIp = normalizeSessionText(input.requestedIp, 128);
  const requestedUserAgent = normalizeSessionText(input.requestedUserAgent, 512);

  database
    .prepare(
      "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at, used_at, requested_ip, requested_user_agent) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)"
    )
    .run(createId(16), input.userId, tokenHash, expiresAt, now, requestedIp, requestedUserAgent);

  return { token, expiresAt };
}

export function consumePasswordResetToken(token: string): { userId: string } | null {
  const database = requireDb();
  const now = Date.now();

  deleteExpiredPasswordResetTokens(now);

  const tokenHash = hashPasswordResetToken(token);
  const row = database
    .prepare(
      "SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ? LIMIT 1"
    )
    .get(tokenHash) as PasswordResetTokenRow | undefined;

  if (!row || row.used_at !== null || row.expires_at <= now) {
    return null;
  }

  const result = database
    .prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?")
    .run(now, row.id, now);
  if (result.changes <= 0) {
    return null;
  }

  return { userId: row.user_id };
}

export function deleteExpiredPasswordResetTokens(now = Date.now()): void {
  const database = requireDb();
  database.prepare("DELETE FROM password_reset_tokens WHERE expires_at <= ?").run(now);
}

export function listSessionsByUserId(userId: string): AuthSession[] {
  const database = requireDb();
  const now = Date.now();
  deleteExpiredSessions(now);

  const rows = database
    .prepare(
      `
      SELECT id, user_id, created_at, expires_at, last_seen_at, user_agent, ip_address, label
      FROM sessions
      WHERE user_id = ? AND expires_at > ?
      ORDER BY last_seen_at DESC, created_at DESC
      `
    )
    .all(userId, now) as SessionRow[];

  return rows.map(mapSessionRowToAuthSession);
}

export function deleteSessionForUser(sessionId: string, userId: string): boolean {
  const database = requireDb();
  const result = database
    .prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?")
    .run(sessionId, userId);
  return result.changes > 0;
}

export function deleteOtherUserSessions(userId: string, currentSessionId: string): number {
  const database = requireDb();
  const result = database
    .prepare("DELETE FROM sessions WHERE user_id = ? AND id <> ?")
    .run(userId, currentSessionId);
  return result.changes;
}

export function findSessionUser(sessionId: string): { user: AuthUser; session: AuthSession } | null {
  const database = requireDb();
  const now = Date.now();
  const row = database
    .prepare(
      `
      SELECT
        s.user_id,
        u.id,
        u.username,
        u.role,
        s.id AS session_id,
        s.created_at,
        s.expires_at,
        s.last_seen_at,
        s.user_agent,
        s.ip_address,
        s.label
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

  if (row.expires_at <= now) {
    deleteSession(sessionId);
    return null;
  }

  let lastSeenAt = row.last_seen_at;
  if (now - lastSeenAt >= SESSION_HEARTBEAT_INTERVAL_MS) {
    database
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
      .run(now, sessionId);
    lastSeenAt = now;
  }

  return {
    user: {
      id: row.id,
      username: row.username,
      role: row.role
    },
    session: {
      id: row.session_id,
      userId: row.user_id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastSeenAt,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      label: row.label
    }
  };
}

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
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL ?? "");
  const syncBootstrapAdminPassword = shouldSyncBootstrapAdminPassword();

  if (!username) {
    return null;
  }

  const existing = findUserByUsername(username);
  if (existing) {
    if (existing.role !== "admin") {
      updateUserRole(existing.id, "admin");
    }

    if (adminEmail && existing.email !== adminEmail) {
      updateUserEmail(existing.id, adminEmail);
    }

    if (syncBootstrapAdminPassword) {
      updateUserPassword(existing.id, password);
    }

    const promoted = findUserById(existing.id);
    return promoted ?? {
      id: existing.id,
      username: existing.username,
      role: "admin"
    };
  }

  return createUser(username, password, "admin", adminEmail);
}
