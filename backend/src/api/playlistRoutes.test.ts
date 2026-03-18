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

async function createUserAsAdmin(input: {
  adminCookie: string;
  username: string;
  password: string;
}): Promise<void> {
  const response = await apiRequest("/api/users", {
    method: "POST",
    headers: {
      Cookie: input.adminCookie
    },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      role: "user"
    })
  });

  expect(response.status).toBe(201);
}

beforeEach(async () => {
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "flaque-playlists-api-"));
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

describe("playlistRoutes", () => {
  it("requires authentication", async () => {
    const response = await apiRequest("/api/playlists", {
      method: "GET"
    });

    expect(response.status).toBe(401);
  });

  it("supports private and public playlist visibility", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    await createUserAsAdmin({
      adminCookie,
      username: "alice",
      password: "alice-secret-123"
    });
    await createUserAsAdmin({
      adminCookie,
      username: "bob",
      password: "bob-secret-123"
    });

    const aliceCookie = await login("alice", "alice-secret-123");
    const bobCookie = await login("bob", "bob-secret-123");

    const privateCreate = await apiRequest("/api/playlists", {
      method: "POST",
      headers: {
        Cookie: aliceCookie
      },
      body: JSON.stringify({
        name: "Alice private",
        visibility: "private",
        trackIds: ["track-1", "track-2"]
      })
    });

    expect(privateCreate.status).toBe(201);
    const privatePlaylistId = (privateCreate.payload as { playlist: { id: string } }).playlist.id;

    const bobListAfterPrivate = await apiRequest("/api/playlists", {
      method: "GET",
      headers: {
        Cookie: bobCookie
      }
    });

    expect(bobListAfterPrivate.status).toBe(200);
    expect((bobListAfterPrivate.payload as { playlists: Array<{ id: string }> }).playlists).toHaveLength(0);

    const publicCreate = await apiRequest("/api/playlists", {
      method: "POST",
      headers: {
        Cookie: aliceCookie
      },
      body: JSON.stringify({
        name: "Alice public",
        visibility: "public",
        trackIds: ["track-3"]
      })
    });

    expect(publicCreate.status).toBe(201);
    const publicPlaylistId = (publicCreate.payload as { playlist: { id: string } }).playlist.id;

    const bobListAfterPublic = await apiRequest("/api/playlists", {
      method: "GET",
      headers: {
        Cookie: bobCookie
      }
    });

    expect(bobListAfterPublic.status).toBe(200);
    expect(bobListAfterPublic.payload).toEqual(
      expect.objectContaining({
        playlists: expect.arrayContaining([
          expect.objectContaining({
            id: publicPlaylistId,
            visibility: "public",
            owner: expect.objectContaining({ username: "alice" }),
            isOwner: false
          })
        ])
      })
    );

    const bobPrivateRead = await apiRequest(`/api/playlists/${privatePlaylistId}`, {
      method: "GET",
      headers: {
        Cookie: bobCookie
      }
    });
    expect(bobPrivateRead.status).toBe(404);

    const bobPublicRead = await apiRequest(`/api/playlists/${publicPlaylistId}`, {
      method: "GET",
      headers: {
        Cookie: bobCookie
      }
    });
    expect(bobPublicRead.status).toBe(200);
  });

  it("limits playlist updates and deletion to owner or admin", async () => {
    const adminCookie = await login("admin", "admin-secret-123");
    await createUserAsAdmin({
      adminCookie,
      username: "alice",
      password: "alice-secret-123"
    });
    await createUserAsAdmin({
      adminCookie,
      username: "bob",
      password: "bob-secret-123"
    });

    const aliceCookie = await login("alice", "alice-secret-123");
    const bobCookie = await login("bob", "bob-secret-123");

    const createResponse = await apiRequest("/api/playlists", {
      method: "POST",
      headers: {
        Cookie: aliceCookie
      },
      body: JSON.stringify({
        name: "Editable list",
        visibility: "private",
        trackIds: ["a", "b"]
      })
    });
    expect(createResponse.status).toBe(201);

    const playlistId = (createResponse.payload as { playlist: { id: string } }).playlist.id;

    const forbiddenPatch = await apiRequest(`/api/playlists/${playlistId}`, {
      method: "PATCH",
      headers: {
        Cookie: bobCookie
      },
      body: JSON.stringify({
        name: "Hacked"
      })
    });
    expect(forbiddenPatch.status).toBe(403);

    const ownerPatch = await apiRequest(`/api/playlists/${playlistId}`, {
      method: "PATCH",
      headers: {
        Cookie: aliceCookie
      },
      body: JSON.stringify({
        name: "Updated list",
        visibility: "public",
        trackIds: ["a", "c", "c"]
      })
    });

    expect(ownerPatch.status).toBe(200);
    expect(ownerPatch.payload).toEqual(
      expect.objectContaining({
        playlist: expect.objectContaining({
          id: playlistId,
          name: "Updated list",
          visibility: "public",
          trackIds: ["a", "c"]
        })
      })
    );

    const forbiddenDelete = await apiRequest(`/api/playlists/${playlistId}`, {
      method: "DELETE",
      headers: {
        Cookie: bobCookie
      }
    });
    expect(forbiddenDelete.status).toBe(403);

    const ownerDelete = await apiRequest(`/api/playlists/${playlistId}`, {
      method: "DELETE",
      headers: {
        Cookie: aliceCookie
      }
    });
    expect(ownerDelete.status).toBe(204);
  });
});
