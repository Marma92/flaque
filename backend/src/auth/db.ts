import Database from "better-sqlite3";

import type { AuthUser, PlaylistRecord, PlaylistVisibility, UserRole } from "../types/library";
import { createId } from "../utils/hash";
import { usersDbPath } from "../utils/paths";
import { hashPassword } from "./password";

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

type PlaylistRow = {
  id: string;
  owner_id: string;
  name: string;
  visibility: PlaylistVisibility;
  created_at: number;
  updated_at: number;
};

type PlaylistTrackRow = {
  track_id: string;
  position: number;
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

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, position),
      FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_playlists_owner_id ON playlists(owner_id);
    CREATE INDEX IF NOT EXISTS idx_playlists_visibility ON playlists(visibility);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);
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

function normalizePlaylistTrackIds(trackIds: string[]): string[] {
  const deduplicated = new Set<string>();
  const normalized: string[] = [];

  for (const trackId of trackIds) {
    if (typeof trackId !== "string") {
      continue;
    }

    const trimmed = trackId.trim();
    if (!trimmed || deduplicated.has(trimmed)) {
      continue;
    }

    deduplicated.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function readPlaylistTrackIds(database: Database.Database, playlistId: string): string[] {
  const rows = database
    .prepare(
      "SELECT track_id, position FROM playlist_tracks WHERE playlist_id = ? ORDER BY position ASC"
    )
    .all(playlistId) as PlaylistTrackRow[];

  return rows.map((row) => row.track_id);
}

function toPlaylistRecord(
  database: Database.Database,
  row: PlaylistRow | undefined
): PlaylistRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trackIds: readPlaylistTrackIds(database, row.id)
  };
}

export function getPlaylistById(playlistId: string): PlaylistRecord | null {
  const database = requireDb();
  const row = database
    .prepare(
      "SELECT id, owner_id, name, visibility, created_at, updated_at FROM playlists WHERE id = ? LIMIT 1"
    )
    .get(playlistId) as PlaylistRow | undefined;

  return toPlaylistRecord(database, row);
}

export function getAccessiblePlaylistById(
  playlistId: string,
  viewerUserId: string
): PlaylistRecord | null {
  const database = requireDb();
  const row = database
    .prepare(
      `
      SELECT id, owner_id, name, visibility, created_at, updated_at
      FROM playlists
      WHERE id = ?
        AND (owner_id = ? OR visibility = 'public')
      LIMIT 1
      `
    )
    .get(playlistId, viewerUserId) as PlaylistRow | undefined;

  return toPlaylistRecord(database, row);
}

export function listAccessiblePlaylists(viewerUserId: string): PlaylistRecord[] {
  const database = requireDb();
  const rows = database
    .prepare(
      `
      SELECT id, owner_id, name, visibility, created_at, updated_at
      FROM playlists
      WHERE owner_id = ? OR visibility = 'public'
      ORDER BY updated_at DESC, created_at DESC, name ASC
      `
    )
    .all(viewerUserId) as PlaylistRow[];

  return rows
    .map((row) => toPlaylistRecord(database, row))
    .filter((playlist): playlist is PlaylistRecord => Boolean(playlist));
}

export function createPlaylist(input: {
  ownerId: string;
  name: string;
  visibility: PlaylistVisibility;
  trackIds: string[];
}): PlaylistRecord {
  const database = requireDb();
  const playlistId = createId(20);
  const now = Date.now();
  const trackIds = normalizePlaylistTrackIds(input.trackIds);

  const transaction = database.transaction(() => {
    database
      .prepare(
        "INSERT INTO playlists (id, owner_id, name, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .run(playlistId, input.ownerId, input.name, input.visibility, now, now);

    const insertTrack = database.prepare(
      "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)"
    );

    trackIds.forEach((trackId, index) => {
      insertTrack.run(playlistId, trackId, index);
    });
  });

  transaction();

  const created = getPlaylistById(playlistId);
  if (!created) {
    throw new Error("Unable to create playlist");
  }

  return created;
}

export function updatePlaylist(
  playlistId: string,
  patch: {
    name?: string;
    visibility?: PlaylistVisibility;
    trackIds?: string[];
  }
): PlaylistRecord | null {
  const database = requireDb();

  const transaction = database.transaction(() => {
    const current = database
      .prepare("SELECT id, owner_id, name, visibility, created_at, updated_at FROM playlists WHERE id = ?")
      .get(playlistId) as PlaylistRow | undefined;

    if (!current) {
      return false;
    }

    const nextName = patch.name ?? current.name;
    const nextVisibility = patch.visibility ?? current.visibility;
    const updatedAt = Date.now();

    database
      .prepare("UPDATE playlists SET name = ?, visibility = ?, updated_at = ? WHERE id = ?")
      .run(nextName, nextVisibility, updatedAt, playlistId);

    if (patch.trackIds) {
      const normalizedTrackIds = normalizePlaylistTrackIds(patch.trackIds);
      database.prepare("DELETE FROM playlist_tracks WHERE playlist_id = ?").run(playlistId);

      const insertTrack = database.prepare(
        "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)"
      );

      normalizedTrackIds.forEach((trackId, index) => {
        insertTrack.run(playlistId, trackId, index);
      });
    }

    return true;
  });

  const updated = transaction();
  if (!updated) {
    return null;
  }

  return getPlaylistById(playlistId);
}

export function deletePlaylistById(playlistId: string): boolean {
  const database = requireDb();
  const result = database.prepare("DELETE FROM playlists WHERE id = ?").run(playlistId);
  return result.changes > 0;
}

export function ensureDefaultAdmin(): AuthUser | null {
  const username = (process.env.ADMIN_USERNAME ?? "admin").trim();
  const password = process.env.ADMIN_PASSWORD ?? "admin1234";

  const existing = findUserByUsername(username);
  if (existing) {
    return {
      id: existing.id,
      username: existing.username,
      role: existing.role
    };
  }

  return createUser(username, password, "admin");
}
