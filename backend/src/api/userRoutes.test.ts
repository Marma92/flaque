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

beforeEach(async () => {
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "flaque-users-api-"));
  process.env.DATA_ROOT = dataRoot;
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "admin-secret-123";
  process.env.CORS_ORIGIN = "http://localhost:5173";

  await bootstrapServer();
});

afterEach(async () => {
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
  }

  await fs.rm(dataRoot, { recursive: true, force: true });
  delete process.env.DATA_ROOT;
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.CORS_ORIGIN;
  server = null;
  baseUrl = "";
  vi.resetModules();
});

describe("userRoutes", () => {
  it("requires admin auth for user listing", async () => {
    const response = await apiRequest("/api/users", {
      method: "GET"
    });

    expect(response.status).toBe(401);
  });

  it("allows admin to create and list users", async () => {
    const adminCookie = await login("admin", "admin-secret-123");

    const createResponse = await apiRequest("/api/users", {
      method: "POST",
      headers: {
        Cookie: adminCookie
      },
      body: JSON.stringify({
        username: "alice",
        password: "strong-password",
        role: "user"
      })
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.payload).toMatchObject({
      user: {
        username: "alice",
        role: "user"
      }
    });

    const listResponse = await apiRequest("/api/users", {
      method: "GET",
      headers: {
        Cookie: adminCookie
      }
    });

    expect(listResponse.status).toBe(200);
    expect(listResponse.payload).toEqual(
      expect.objectContaining({
        users: expect.arrayContaining([
          expect.objectContaining({ username: "admin", role: "admin" }),
          expect.objectContaining({ username: "alice", role: "user" })
        ])
      })
    );
  });

  it("rejects user listing for non-admin sessions", async () => {
    const adminCookie = await login("admin", "admin-secret-123");

    const createResponse = await apiRequest("/api/users", {
      method: "POST",
      headers: {
        Cookie: adminCookie
      },
      body: JSON.stringify({
        username: "bob",
        password: "another-strong-password",
        role: "user"
      })
    });
    expect(createResponse.status).toBe(201);

    const userCookie = await login("bob", "another-strong-password");

    const listResponse = await apiRequest("/api/users", {
      method: "GET",
      headers: {
        Cookie: userCookie
      }
    });

    expect(listResponse.status).toBe(403);
  });
});
