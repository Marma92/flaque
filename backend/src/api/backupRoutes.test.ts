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
    // Stop backup scheduler before closing server to prevent timers from
    // firing after the database connection has been closed.
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

  it("creates a backup, lists it, and deletes it", async () => {
    const cookie = await login("admin", "admin-secret-123");

    // List should be empty initially
    const listBefore = await apiRequest("/api/backups", {
      headers: { Cookie: cookie }
    });

    expect(listBefore.status).toBe(200);
    const beforePayload = listBefore.payload as { backups: unknown[] };
    expect(beforePayload.backups).toHaveLength(0);

    // Create a backup
    const createRes = await apiRequest("/api/backup", {
      method: "POST",
      headers: { Cookie: cookie }
    });

    expect(createRes.status).toBe(201);
    const manifest = createRes.payload as {
      id: string;
      trigger: string;
      includesDatabase: boolean;
      includesIndex: boolean;
      sizeBytes: number;
      files: string[];
    };
    expect(manifest.trigger).toBe("manual");
    expect(manifest.includesDatabase).toBe(true);
    expect(manifest.files).toContain("users.db");
    expect(manifest.sizeBytes).toBeGreaterThan(0);

    // List should now contain the backup
    const listAfter = await apiRequest("/api/backups", {
      headers: { Cookie: cookie }
    });

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
    const listFinal = await apiRequest("/api/backups", {
      headers: { Cookie: cookie }
    });

    const finalPayload = listFinal.payload as { backups: unknown[] };
    expect(finalPayload.backups).toHaveLength(0);
  });

  it("reads and updates backup configuration", async () => {
    const cookie = await login("admin", "admin-secret-123");

    // Read default config
    const getRes = await apiRequest("/api/backup/config", {
      headers: { Cookie: cookie }
    });

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
        retentionDays: 7
      })
    });

    expect(putRes.status).toBe(200);
    const updated = putRes.payload as {
      scheduledEnabled: boolean;
      intervalHours: number;
      retentionDays: number;
      includeIndex: boolean;
    };
    expect(updated.scheduledEnabled).toBe(true);
    expect(updated.intervalHours).toBe(12);
    expect(updated.retentionDays).toBe(7);
    expect(updated.includeIndex).toBe(true);
  });

  it("restores database from a backup", async () => {
    const cookie = await login("admin", "admin-secret-123");

    // Create a backup
    const createRes = await apiRequest("/api/backup", {
      method: "POST",
      headers: { Cookie: cookie }
    });

    expect(createRes.status).toBe(201);
    const manifest = createRes.payload as { id: string };

    // Restore from the backup
    const restoreRes = await apiRequest(`/api/backups/${encodeURIComponent(manifest.id)}/restore`, {
      method: "POST",
      headers: { Cookie: cookie }
    });

    expect(restoreRes.status).toBe(200);
    const restorePayload = restoreRes.payload as { message: string };
    expect(restorePayload.message).toContain("restored");
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
    const body = await downloadRes.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(0);
  });

  it("returns 404 for non-existent backup", async () => {
    const cookie = await login("admin", "admin-secret-123");

    const res = await apiRequest("/api/backups/nonexistent/download", {
      headers: { Cookie: cookie }
    });

    expect(res.status).toBe(404);
  });

  it("rejects backup operations for non-admin users", async () => {
    const adminCookie = await login("admin", "admin-secret-123");

    // Create a regular user
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

    const res = await apiRequest("/api/backup", {
      method: "POST",
      headers: { Cookie: userCookie }
    });

    expect(res.status).toBe(403);
  });
});
