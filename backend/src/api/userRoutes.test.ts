import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { apiRequest, getBaseUrl, getDataRoot, login, setupTestServer, teardownTestServer } from "./testHelpers";

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

  const response = await fetch(`${getBaseUrl()}${input.pathname}`, {
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

async function currentUserId(cookie: string): Promise<string> {
  const response = await apiRequest("/api/auth/me", {
    method: "GET",
    headers: { Cookie: cookie }
  });

  expect(response.status).toBe(200);
  const payload = response.payload as { user: { id: string } };
  return payload.user.id;
}

async function createUserAsAdmin(input: {
  adminCookie: string;
  username: string;
  password: string;
  email?: string;
  role?: "user" | "admin";
}): Promise<{ id: string; username: string; role: "user" | "admin" }> {
  const response = await apiRequest("/api/users", {
    method: "POST",
    headers: { Cookie: input.adminCookie },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      email: input.email ?? `${input.username}@test.local`,
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
  payload: { username?: string; role?: "user" | "admin" };
}): Promise<{ id: string; username: string; role: "user" | "admin" }> {
  const response = await apiRequest(`/api/users/${input.userId}`, {
    method: "PATCH",
    headers: { Cookie: input.adminCookie },
    body: JSON.stringify(input.payload)
  });

  expect(response.status).toBe(200);
  const payload = response.payload as { user: { id: string; username: string; role: "user" | "admin" } };
  return payload.user;
}

beforeEach(async () => {
  await setupTestServer({ tempDirPrefix: "flaque-users-api-" });
});

afterEach(async () => {
  await teardownTestServer();
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
      password: "strong-password-1",
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
      password: "another-strong-password-2-1",
      role: "user"
    });

    const userCookie = await login("bob", "another-strong-password-2-1");

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
      password: "grace-password-3",
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
        password: "grace-password-3"
      })
    });
    expect(oldLoginResponse.status).toBe(401);

    const newLoginResponse = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "grace-renamed",
        password: "grace-password-3"
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
      password: "hannah-password-4",
      role: "user"
    });
    const second = await createUserAsAdmin({
      adminCookie,
      username: "ivan",
      password: "ivan-password-5",
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
      password: "carol-old-password-6",
      role: "user"
    });

    const oldCookie = await login("carol", "carol-old-password-6");

    const resetResponse = await apiRequest(`/api/users/${created.id}/reset-password`, {
      method: "POST",
      headers: {
        Cookie: adminCookie
      },
      body: JSON.stringify({
        password: "carol-new-password-7"
      })
    });
    expect(resetResponse.status).toBe(200);

    const oldLoginResponse = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "carol",
        password: "carol-old-password-6"
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

    const newCookie = await login("carol", "carol-new-password-7");
    expect(newCookie).toContain("flaque_session=");
  });

  it("allows users to change their own password", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    await createUserAsAdmin({
      adminCookie,
      username: "marie",
      password: "marie-old-password-8",
      role: "user"
    });

    const userCookie = await login("marie", "marie-old-password-8");

    const changeResponse = await apiRequest("/api/users/me/password", {
      method: "POST",
      headers: {
        Cookie: userCookie
      },
      body: JSON.stringify({
        currentPassword: "marie-old-password-8",
        newPassword: "marie-new-password-9"
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
        password: "marie-old-password-8"
      })
    });
    expect(oldLoginResponse.status).toBe(401);

    const newLoginResponse = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "marie",
        password: "marie-new-password-9"
      })
    });
    expect(newLoginResponse.status).toBe(200);
  });

  it("stores and serves profile photos from the user folder", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    await createUserAsAdmin({
      adminCookie,
      username: "nina",
      password: "nina-password-10",
      role: "user"
    });

    const userCookie = await login("nina", "nina-password-10");
    const userId = await currentUserId(userCookie);
    const dataRoot = getDataRoot();
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
    const avatarFiles = profileEntries.filter((entry: string) => entry.startsWith("avatar."));
    expect(avatarFiles).toEqual(["avatar.webp"]);

    const photoResponse = await fetch(`${getBaseUrl()}/api/users/me/photo`, {
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
      password: "dave-password-11",
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
        password: "dave-password-11"
      })
    });
    expect(deletedLoginResponse.status).toBe(401);
  });

  it("rejects patch, delete and reset endpoints for non-admin users", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    const target = await createUserAsAdmin({
      adminCookie,
      username: "eve",
      password: "eve-password-12",
      role: "user"
    });
    await createUserAsAdmin({
      adminCookie,
      username: "frank",
      password: "frank-password-13",
      role: "user"
    });

    const userCookie = await login("frank", "frank-password-13");

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
        password: "eve-password-12-new"
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
