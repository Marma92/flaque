import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dataRoot = "";
let usersDbPath = "";

function createLegacyAuthDatabase(filePath: string): { sessionCreatedAt: number } {
  const database = new Database(filePath);
  const now = Date.now();
  const sessionCreatedAt = now - 5_000;

  database.exec(`
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

  database
    .prepare("INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("legacy-user", "legacy", "legacy-hash", "user", now - 10_000);

  database
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run("legacy-session", "legacy-user", now + 120_000, sessionCreatedAt);

  database.close();
  return { sessionCreatedAt };
}

beforeEach(async () => {
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "flaque-auth-migration-"));
  process.env.DATA_ROOT = dataRoot;
  vi.resetModules();

  const { ensureBaseDirectories } = await import("../utils/fs");
  const { usersDbPath: resolvedUsersDbPath } = await import("../utils/paths");

  usersDbPath = resolvedUsersDbPath;
  await ensureBaseDirectories();
});

afterEach(async () => {
  await fs.rm(dataRoot, { recursive: true, force: true });
  delete process.env.DATA_ROOT;
  vi.resetModules();
});

describe("initializeAuthDatabase migrations", () => {
  it("auto-migrates legacy sessions schema on startup", async () => {
    const { sessionCreatedAt } = createLegacyAuthDatabase(usersDbPath);

    const { initializeAuthDatabase, listSessionsByUserId } = await import("./db");
    expect(() => initializeAuthDatabase()).not.toThrow();

    const sessions = listSessionsByUserId("legacy-user");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: "legacy-session",
      userId: "legacy-user",
      createdAt: sessionCreatedAt,
      expiresAt: expect.any(Number),
      lastSeenAt: sessionCreatedAt,
      userAgent: null,
      ipAddress: null,
      label: null
    });

    const migratedDb = new Database(usersDbPath, { readonly: true });
    const userColumns = migratedDb.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    const userIndexes = migratedDb.prepare("PRAGMA index_list(users)").all() as Array<{ name: string }>;
    const columns = migratedDb.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
    const indexes = migratedDb.prepare("PRAGMA index_list(sessions)").all() as Array<{ name: string }>;
    migratedDb.close();

    expect(userColumns.some((column) => column.name === "email")).toBe(true);
    expect(userIndexes.some((index) => index.name === "idx_users_email")).toBe(true);
    expect(columns.some((column) => column.name === "last_seen_at")).toBe(true);
    expect(columns.some((column) => column.name === "user_agent")).toBe(true);
    expect(columns.some((column) => column.name === "ip_address")).toBe(true);
    expect(columns.some((column) => column.name === "label")).toBe(true);
    expect(indexes.some((index) => index.name === "idx_sessions_last_seen_at")).toBe(true);
  });
});
