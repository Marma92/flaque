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

async function apiMultipartRequest(input: {
  pathname: string;
  cookie: string;
  fileFieldName: string;
  fileName: string;
  mimeType: string;
  bytes: number[];
}) {
  const formData = new FormData();
  const binary = Uint8Array.from(input.bytes);
  formData.append(input.fileFieldName, new Blob([binary.buffer as ArrayBuffer], { type: input.mimeType }), input.fileName);

  const response = await fetch(`${baseUrl}${input.pathname}`, {
    method: "POST",
    headers: {
      Cookie: input.cookie
    },
    body: formData
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
    cookie: response.headers.get("set-cookie"),
    contentType: response.headers.get("content-type")
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

async function currentUserId(cookie: string): Promise<string> {
  const response = await apiRequest("/api/auth/me", {
    method: "GET",
    headers: {
      Cookie: cookie
    }
  });

  expect(response.status).toBe(200);
  const payload = response.payload as { user: { id: string } };
  return payload.user.id;
}

async function createUserAsAdmin(input: {
  adminCookie: string;
  username: string;
  password: string;
  role?: "user" | "admin";
}): Promise<{ id: string; username: string; role: "user" | "admin" }> {
  const response = await apiRequest("/api/users", {
    method: "POST",
    headers: {
      Cookie: input.adminCookie
    },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      role: input.role ?? "user"
    })
  });

  expect(response.status).toBe(201);
  const payload = response.payload as { id?: string; user: { id: string; username: string; role: "user" | "admin" } };
  return payload.user;
}

async function patchUserAsAdmin(input: {
  adminCookie: string;
  userId: string;
  payload: {
    username?: string;
    role?: "user" | "admin";
  };
}): Promise<{ id: string; username: string; role: "user" | "admin" }> {
  const response = await apiRequest(`/api/users/${input.userId}`, {
    method: "PATCH",
    headers: {
      Cookie: input.adminCookie
    },
    body: JSON.stringify(input.payload)
  });

  expect(response.status).toBe(200);
  const payload = response.payload as { user: { id: string; username: string; role: "user" | "admin" } };
  return payload.user;
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

    const createdUser = await createUserAsAdmin({
      adminCookie,
      username: "alice",
      password: "strong-password",
      role: "user"
    });

    expect(createdUser).toMatchObject({
      id: expect.any(String),
      username: "alice",
      role: "user"
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

    await createUserAsAdmin({
      adminCookie,
      username: "bob",
      password: "another-strong-password",
      role: "user"
    });

    const userCookie = await login("bob", "another-strong-password");

    const listResponse = await apiRequest("/api/users", {
      method: "GET",
      headers: {
        Cookie: userCookie
      }
    });

    expect(listResponse.status).toBe(403);
  });

  it("allows admin to patch username and role", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    const created = await createUserAsAdmin({
      adminCookie,
      username: "grace",
      password: "grace-password",
      role: "user"
    });

    const patched = await patchUserAsAdmin({
      adminCookie,
      userId: created.id,
      payload: {
        username: "grace-renamed",
        role: "admin"
      }
    });

    expect(patched).toMatchObject({
      id: created.id,
      username: "grace-renamed",
      role: "admin"
    });

    const oldLoginResponse = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "grace",
        password: "grace-password"
      })
    });
    expect(oldLoginResponse.status).toBe(401);

    const newLoginResponse = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "grace-renamed",
        password: "grace-password"
      })
    });
    expect(newLoginResponse.status).toBe(200);
  });

  it("rejects patch when trying to demote the last admin", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    const adminId = await currentUserId(adminCookie);

    const patchResponse = await apiRequest(`/api/users/${adminId}`, {
      method: "PATCH",
      headers: {
        Cookie: adminCookie
      },
      body: JSON.stringify({
        role: "user"
      })
    });

    expect(patchResponse.status).toBe(400);
  });

  it("rejects patch when username already exists", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    const first = await createUserAsAdmin({
      adminCookie,
      username: "hannah",
      password: "hannah-password",
      role: "user"
    });
    const second = await createUserAsAdmin({
      adminCookie,
      username: "ivan",
      password: "ivan-password",
      role: "user"
    });

    const patchResponse = await apiRequest(`/api/users/${second.id}`, {
      method: "PATCH",
      headers: {
        Cookie: adminCookie
      },
      body: JSON.stringify({
        username: first.username
      })
    });

    expect(patchResponse.status).toBe(409);
  });

  it("allows admin password reset and revokes existing sessions", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    const created = await createUserAsAdmin({
      adminCookie,
      username: "carol",
      password: "carol-old-password",
      role: "user"
    });

    const oldCookie = await login("carol", "carol-old-password");

    const resetResponse = await apiRequest(`/api/users/${created.id}/reset-password`, {
      method: "POST",
      headers: {
        Cookie: adminCookie
      },
      body: JSON.stringify({
        password: "carol-new-password"
      })
    });
    expect(resetResponse.status).toBe(200);

    const oldLoginResponse = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "carol",
        password: "carol-old-password"
      })
    });
    expect(oldLoginResponse.status).toBe(401);

    const meWithOldCookie = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: oldCookie
      }
    });
    expect(meWithOldCookie.status).toBe(401);

    const newCookie = await login("carol", "carol-new-password");
    expect(newCookie).toContain("flaque_session=");
  });

  it("allows users to change their own password", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    await createUserAsAdmin({
      adminCookie,
      username: "marie",
      password: "marie-old-password",
      role: "user"
    });

    const userCookie = await login("marie", "marie-old-password");

    const changeResponse = await apiRequest("/api/users/me/password", {
      method: "POST",
      headers: {
        Cookie: userCookie
      },
      body: JSON.stringify({
        currentPassword: "marie-old-password",
        newPassword: "marie-new-password"
      })
    });

    expect(changeResponse.status).toBe(200);
    expect(changeResponse.cookie).toContain("flaque_session=");

    const oldSessionResponse = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: userCookie
      }
    });
    expect(oldSessionResponse.status).toBe(401);

    const newSessionCookie = changeResponse.cookie?.split(";", 1)[0] ?? "";
    expect(newSessionCookie).toContain("flaque_session=");

    const meResponse = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: newSessionCookie
      }
    });
    expect(meResponse.status).toBe(200);

    const oldLoginResponse = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "marie",
        password: "marie-old-password"
      })
    });
    expect(oldLoginResponse.status).toBe(401);

    const newLoginResponse = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "marie",
        password: "marie-new-password"
      })
    });
    expect(newLoginResponse.status).toBe(200);
  });

  it("stores and serves profile photos from the user folder", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    await createUserAsAdmin({
      adminCookie,
      username: "nina",
      password: "nina-password",
      role: "user"
    });

    const userCookie = await login("nina", "nina-password");
    const userId = await currentUserId(userCookie);
    const profileDir = path.join(dataRoot, "storage", "users", userId, "profile");
    await fs.mkdir(profileDir, { recursive: true });
    await fs.writeFile(path.join(profileDir, "avatar.png"), "legacy-avatar");

    const tinyPng = Array.from(
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lm8sAAAAASUVORK5CYII=", "base64")
    );

    const uploadResponse = await apiMultipartRequest({
      pathname: "/api/users/me/photo",
      cookie: userCookie,
      fileFieldName: "photo",
      fileName: "avatar.png",
      mimeType: "image/png",
      bytes: tinyPng
    });

    expect(uploadResponse.status).toBe(200);
    expect(uploadResponse.payload).toEqual({ ok: true });

    const avatarPath = path.join(dataRoot, "storage", "users", userId, "profile", "avatar.webp");
    const storedAvatar = await fs.readFile(avatarPath);
    expect(storedAvatar.length).toBeGreaterThan(0);

    const profileEntries = await fs.readdir(profileDir);
    const avatarFiles = profileEntries.filter((entry) => entry.startsWith("avatar."));
    expect(avatarFiles).toEqual(["avatar.webp"]);

    const photoResponse = await fetch(`${baseUrl}/api/users/me/photo`, {
      method: "GET",
      headers: {
        Cookie: userCookie
      }
    });

    expect(photoResponse.status).toBe(200);
    expect(photoResponse.headers.get("content-type")).toContain("image/webp");
    expect(photoResponse.headers.get("cache-control")).toContain("no-store");
    expect(photoResponse.headers.get("vary")).toContain("Cookie");
    const downloadedAvatar = Buffer.from(await photoResponse.arrayBuffer());
    expect(downloadedAvatar.length).toBeGreaterThan(0);
  });

  it("prevents deleting own account and allows deleting another user", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    const adminId = await currentUserId(adminCookie);
    const created = await createUserAsAdmin({
      adminCookie,
      username: "dave",
      password: "dave-password",
      role: "user"
    });

    const selfDeleteResponse = await apiRequest(`/api/users/${adminId}`, {
      method: "DELETE",
      headers: {
        Cookie: adminCookie
      }
    });
    expect(selfDeleteResponse.status).toBe(400);

    const deleteResponse = await apiRequest(`/api/users/${created.id}`, {
      method: "DELETE",
      headers: {
        Cookie: adminCookie
      }
    });
    expect(deleteResponse.status).toBe(204);

    const deletedLoginResponse = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "dave",
        password: "dave-password"
      })
    });
    expect(deletedLoginResponse.status).toBe(401);
  });

  it("rejects patch, delete and reset endpoints for non-admin users", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    const target = await createUserAsAdmin({
      adminCookie,
      username: "eve",
      password: "eve-password",
      role: "user"
    });
    await createUserAsAdmin({
      adminCookie,
      username: "frank",
      password: "frank-password",
      role: "user"
    });

    const userCookie = await login("frank", "frank-password");

    const patchResponse = await apiRequest(`/api/users/${target.id}`, {
      method: "PATCH",
      headers: {
        Cookie: userCookie
      },
      body: JSON.stringify({
        role: "admin"
      })
    });
    expect(patchResponse.status).toBe(403);

    const resetResponse = await apiRequest(`/api/users/${target.id}/reset-password`, {
      method: "POST",
      headers: {
        Cookie: userCookie
      },
      body: JSON.stringify({
        password: "eve-password-new"
      })
    });
    expect(resetResponse.status).toBe(403);

    const deleteResponse = await apiRequest(`/api/users/${target.id}`, {
      method: "DELETE",
      headers: {
        Cookie: userCookie
      }
    });
    expect(deleteResponse.status).toBe(403);
  });
});
