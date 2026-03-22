import { createId } from "../utils/hash";

import {
  requireDb,
  normalizeSessionText,
  hashPasswordResetToken
} from "./dbConnection";
import type { PasswordResetTokenRow } from "./dbConnection";

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
