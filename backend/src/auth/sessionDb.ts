import type { AuthSession, AuthUser } from "../types/auth";
import { createId } from "../utils/hash";

import {
  requireDb,
  normalizeSessionText,
  mapSessionRowToAuthSession,
  SESSION_HEARTBEAT_INTERVAL_MS
} from "./dbConnection";
import type { SessionRow, SessionUserRow } from "./dbConnection";

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
        COALESCE(u.email, '') AS email,
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
      email: (row as { email?: string }).email ?? "",
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

export function revokeSessionsByUserId(userId: string): void {
  const database = requireDb();
  database.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}
