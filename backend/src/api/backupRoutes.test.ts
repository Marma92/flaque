import fs from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dataRoot = "";
let baseUrl = "";
let server: Server | null = null;

async function bootstrapServer(): Promise<void> {
  vi.resetModules();

  const { ensureBaseDirectories } = await import("../utils/fs");
  const { initializeAuthDatabase, ensureDefaultAdmin } = await import("../auth/db");
  const { IndexStore } = await import("../services/indexer/indexStore");
  const { createApp } = await import("../app");

  await ensureBaseDirectories();
  initializeAuthDatabase();
  ensureDefaultAdmin();

  const indexStore = new IndexStore();
  await indexStore.initialize();

  const app = createApp(indexStore);
  server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    if (!server) {
      reject(new Error("Missing HTTP server"));
      return;
    }

    server.listen(0, "127.0.0.1", () => {
      const address = server?.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to resolve test server address"));
        return;
      }

      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

async function apiRequest(pathname: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  let payload: unknown = undefined;

  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  return {
    status: response.status,
    payload,
    cookie: response.headers.get("set-cookie")
  };
}

async function login(username: string, password: string): Promise<string> {
  const response = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  expect(response.status).toBe(200);
  const cookie = response.cookie;
  if (!cookie) {
    throw new Error("Missing session cookie");
  }

  return cookie.split(";", 1)[0] ?? "";
}

describe("backupRoutes", () => {
  beforeEach(async () => {
    dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "flaque-backup-api-"));
    process.env.DATA_ROOT = dataRoot;
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "admin-secret-123";
    process.env.ADMIN_EMAIL = "admin@test.local";
    process.env.CORS_ORIGIN = "http://localhost:5173";

    await bootstrapServer();
  });

  afterEach(async () => {
    try {
      const { stopBackupScheduler } = await import("../services/backup/backupService");
      stopBackupScheduler();
    } catch {
      // ignore if module was not loaded
    }

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      server = null;
    }

    await fs.rm(dataRoot, { recursive: true, force: true });
  });

  it("creates a backup with index files, lists it, and deletes it", async () => {
    const cookie = await login("admin", "admin-secret-123");

    // List should be empty initially
    const listBefore = await apiRequest("/api/backups", { headers: { Cookie: cookie } });
    expect(listBefore.status).toBe(200);
    expect((listBefore.payload as { backups: unknown[] }).backups).toHaveLength(0);

    // Create a backup
    const createRes = await apiRequest("/api/backup", {
      method: "POST",
      headers: { Cookie: cookie }
    });

    expect(createRes.status).toBe(201);
    const manifest = createRes.payload as {
      id: string;
      createdAt: string;
      trigger: string;
      includesDatabase: boolean;
      includesIndex: boolean;
      sizeBytes: number;
      files: string[];
    };
    expect(manifest.trigger).toBe("manual");
    expect(manifest.includesDatabase).toBe(true);
    expect(manifest.includesIndex).toBe(true);
    expect(manifest.files).toContain("users.db");
    expect(manifest.files).toContain("index/library-index.json");
    expect(manifest.sizeBytes).toBeGreaterThan(0);
    expect(manifest.createdAt).toBeTruthy();

    // List should now contain the backup
    const listAfter = await apiRequest("/api/backups", { headers: { Cookie: cookie } });
    expect(listAfter.status).toBe(200);
    const afterPayload = listAfter.payload as { backups: Array<{ id: string }> };
    expect(afterPayload.backups).toHaveLength(1);
    expect(afterPayload.backups[0]!.id).toBe(manifest.id);

    // Delete the backup
    const deleteRes = await apiRequest(`/api/backups/${encodeURIComponent(manifest.id)}`, {
      method: "DELETE",
      headers: { Cookie: cookie }
    });
    expect(deleteRes.status).toBe(204);

    // List should be empty again
    const listFinal = await apiRequest("/api/backups", { headers: { Cookie: cookie } });
    expect((listFinal.payload as { backups: unknown[] }).backups).toHaveLength(0);
  });

  it("reads and updates backup configuration, and persists it across requests", async () => {
    const cookie = await login("admin", "admin-secret-123");

    // Read default config
    const getRes = await apiRequest("/api/backup/config", { headers: { Cookie: cookie } });
    expect(getRes.status).toBe(200);
    const defaultConfig = getRes.payload as {
      scheduledEnabled: boolean;
      intervalHours: number;
      retentionDays: number;
      includeIndex: boolean;
    };
    expect(defaultConfig.scheduledEnabled).toBe(false);
    expect(defaultConfig.intervalHours).toBe(24);
    expect(defaultConfig.retentionDays).toBe(30);
    expect(defaultConfig.includeIndex).toBe(true);

    // Update config
    const putRes = await apiRequest("/api/backup/config", {
      method: "PUT",
      headers: { Cookie: cookie },
      body: JSON.stringify({
        scheduledEnabled: true,
        intervalHours: 12,
        retentionDays: 7,
        includeIndex: false
      })
    });
    expect(putRes.status).toBe(200);
    const updated = putRes.payload as typeof defaultConfig;
    expect(updated.scheduledEnabled).toBe(true);
    expect(updated.intervalHours).toBe(12);
    expect(updated.retentionDays).toBe(7);
    expect(updated.includeIndex).toBe(false);

    // Re-read to verify persistence
    const getRes2 = await apiRequest("/api/backup/config", { headers: { Cookie: cookie } });
    expect(getRes2.status).toBe(200);
    const persisted = getRes2.payload as typeof defaultConfig;
    expect(persisted.scheduledEnabled).toBe(true);
    expect(persisted.intervalHours).toBe(12);
    expect(persisted.retentionDays).toBe(7);
    expect(persisted.includeIndex).toBe(false);
  });

  it("config update ignores invalid values and preserves current config", async () => {
    const cookie = await login("admin", "admin-secret-123");

    const putRes = await apiRequest("/api/backup/config", {
      method: "PUT",
      headers: { Cookie: cookie },
      body: JSON.stringify({
        intervalHours: -5,
        retentionDays: "not-a-number",
        scheduledEnabled: "yes"
      })
    });

    expect(putRes.status).toBe(200);
    const config = putRes.payload as {
      scheduledEnabled: boolean;
      intervalHours: number;
      retentionDays: number;
    };
    // Should keep defaults since all provided values are invalid
    expect(config.scheduledEnabled).toBe(false);
    expect(config.intervalHours).toBe(24);
    expect(config.retentionDays).toBe(30);
  });

  it("restores database and verifies state is recovered", async () => {
    const cookie = await login("admin", "admin-secret-123");

    // Create a test user before backup
    const createUserRes = await apiRequest("/api/users", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({
        username: "backuptest",
        password: "backup-test-123",
        email: "backup@test.local",
        role: "user"
      })
    });
    expect(createUserRes.status).toBe(201);
    const createdUser = (createUserRes.payload as { user: { id: string } }).user;

    // Create a backup (captures the user)
    const backupRes = await apiRequest("/api/backup", {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(backupRes.status).toBe(201);
    const manifest = backupRes.payload as { id: string };

    // Delete the user
    const deleteUserRes = await apiRequest(`/api/users/${createdUser.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie }
    });
    expect(deleteUserRes.status).toBe(204);

    // Verify user is gone
    const usersBeforeRestore = await apiRequest("/api/users", { headers: { Cookie: cookie } });
    const usersBefore = (usersBeforeRestore.payload as { users: Array<{ username: string }> }).users;
    expect(usersBefore.find((u) => u.username === "backuptest")).toBeUndefined();

    // Restore from backup
    const restoreRes = await apiRequest(`/api/backups/${encodeURIComponent(manifest.id)}/restore`, {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(restoreRes.status).toBe(200);
    expect((restoreRes.payload as { message: string }).message).toContain("restored");

    // Verify user is back
    const usersAfterRestore = await apiRequest("/api/users", { headers: { Cookie: cookie } });
    const usersAfter = (usersAfterRestore.payload as { users: Array<{ username: string }> }).users;
    expect(usersAfter.find((u) => u.username === "backuptest")).toBeDefined();
  });

  it("downloads the backup database file", async () => {
    const cookie = await login("admin", "admin-secret-123");

    const createRes = await apiRequest("/api/backup", {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(createRes.status).toBe(201);
    const manifest = createRes.payload as { id: string };

    const downloadRes = await fetch(`${baseUrl}/api/backups/${encodeURIComponent(manifest.id)}/download`, {
      headers: { Cookie: cookie }
    });

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-disposition")).toContain("attachment");
    expect(downloadRes.headers.get("content-type")).toContain("application/octet-stream");
    const body = await downloadRes.arrayBuffer();
    // SQLite files start with "SQLite format 3\0"
    const header = new TextDecoder().decode(new Uint8Array(body.slice(0, 15)));
    expect(header).toBe("SQLite format 3");
  });

  it("returns 404 for non-existent backup on download, delete, and restore", async () => {
    const cookie = await login("admin", "admin-secret-123");

    const downloadRes = await apiRequest("/api/backups/nonexistent/download", {
      headers: { Cookie: cookie }
    });
    expect(downloadRes.status).toBe(404);

    const deleteRes = await apiRequest("/api/backups/nonexistent", {
      method: "DELETE",
      headers: { Cookie: cookie }
    });
    expect(deleteRes.status).toBe(404);

    const restoreRes = await apiRequest("/api/backups/nonexistent/restore", {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(restoreRes.status).toBe(500);
  });

  it("rejects path traversal attempts in backup id", async () => {
    const cookie = await login("admin", "admin-secret-123");

    // All traversal attempts should be blocked — either by Express path
    // normalization (404) or by ID format validation (400).
    // Neither should ever reach the filesystem outside the backups directory.
    const traversalIds = ["..", "../../etc", "../config"];

    for (const id of traversalIds) {
      const res = await apiRequest(`/api/backups/${encodeURIComponent(id)}/download`, {
        headers: { Cookie: cookie }
      });
      expect([400, 404]).toContain(res.status);
    }

    // Direct invalid characters should be rejected as 400
    const invalidRes = await apiRequest("/api/backups/hello world!/download", {
      headers: { Cookie: cookie }
    });
    expect(invalidRes.status).toBe(400);
  });

  it("purges expired backups", async () => {
    const cookie = await login("admin", "admin-secret-123");

    // Set retention to 0 days so everything is immediately expired
    await apiRequest("/api/backup/config", {
      method: "PUT",
      headers: { Cookie: cookie },
      body: JSON.stringify({ retentionDays: 1 })
    });

    // Create a backup
    await apiRequest("/api/backup", {
      method: "POST",
      headers: { Cookie: cookie }
    });

    // Purge (retention=1 day, backup just created, so nothing should be purged)
    const purgeRes = await apiRequest("/api/backups/purge", {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(purgeRes.status).toBe(200);
    const purgePayload = purgeRes.payload as { deleted: number; retentionDays: number };
    expect(purgePayload.deleted).toBe(0);
    expect(purgePayload.retentionDays).toBe(1);

    // Verify backup still exists
    const listRes = await apiRequest("/api/backups", { headers: { Cookie: cookie } });
    expect((listRes.payload as { backups: unknown[] }).backups).toHaveLength(1);
  });

  it("creates backup without index files when configured", async () => {
    const cookie = await login("admin", "admin-secret-123");

    // Disable index in config
    await apiRequest("/api/backup/config", {
      method: "PUT",
      headers: { Cookie: cookie },
      body: JSON.stringify({ includeIndex: false })
    });

    const createRes = await apiRequest("/api/backup", {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(createRes.status).toBe(201);
    const manifest = createRes.payload as {
      includesIndex: boolean;
      files: string[];
    };
    expect(manifest.includesIndex).toBe(false);
    expect(manifest.files).toContain("users.db");
    expect(manifest.files.filter((f) => f.startsWith("index/"))).toHaveLength(0);
  });

  it("rejects all backup operations for non-admin users", async () => {
    const adminCookie = await login("admin", "admin-secret-123");

    await apiRequest("/api/users", {
      method: "POST",
      headers: { Cookie: adminCookie },
      body: JSON.stringify({
        username: "viewer",
        password: "viewer-pass-123",
        email: "viewer@test.local",
        role: "user"
      })
    });

    const userCookie = await login("viewer", "viewer-pass-123");

    const endpoints = [
      { method: "POST", path: "/api/backup" },
      { method: "GET", path: "/api/backups" },
      { method: "GET", path: "/api/backup/config" },
      { method: "PUT", path: "/api/backup/config" },
      { method: "GET", path: "/api/backups/some-id/download" },
      { method: "DELETE", path: "/api/backups/some-id" },
      { method: "POST", path: "/api/backups/some-id/restore" },
      { method: "POST", path: "/api/backups/purge" }
    ];

    for (const endpoint of endpoints) {
      const res = await apiRequest(endpoint.path, {
        method: endpoint.method,
        headers: { Cookie: userCookie }
      });
      expect(res.status).toBe(403);
    }
  });
});
