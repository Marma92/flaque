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

async function login(input: {
  username: string;
  password: string;
  userAgent?: string;
  deviceLabel?: string;
}): Promise<string> {
  const response = await apiRequest("/api/auth/login", {
    method: "POST",
    headers: input.userAgent
      ? {
          "User-Agent": input.userAgent
        }
      : undefined,
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      deviceLabel: input.deviceLabel
    })
  });

  expect(response.status).toBe(200);
  const cookie = response.cookie;
  if (!cookie) {
    throw new Error("Missing session cookie");
  }

  return cookie.split(";", 1)[0] ?? "";
}

beforeEach(async () => {
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "flaque-auth-api-"));
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

describe("authRoutes", () => {
  it("requires auth for session management endpoints", async () => {
    const sessionsResponse = await apiRequest("/api/auth/sessions", {
      method: "GET"
    });
    expect(sessionsResponse.status).toBe(401);

    const revokeResponse = await apiRequest("/api/auth/sessions/non-existent", {
      method: "DELETE"
    });
    expect(revokeResponse.status).toBe(401);

    const logoutOthersResponse = await apiRequest("/api/auth/logout-others", {
      method: "POST"
    });
    expect(logoutOthersResponse.status).toBe(401);
  });

  it("lists active sessions and revokes a targeted session", async () => {
    const currentCookie = await login({
      username: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent A",
      deviceLabel: "Laptop"
    });
    const otherCookie = await login({
      username: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent B",
      deviceLabel: "Phone"
    });

    const listResponse = await apiRequest("/api/auth/sessions", {
      method: "GET",
      headers: {
        Cookie: currentCookie
      }
    });

    expect(listResponse.status).toBe(200);
    const sessions = (listResponse.payload as { sessions: Array<{ id: string; label: string | null; current: boolean }> }).sessions;
    expect(sessions).toHaveLength(2);

    const currentSession = sessions.find((session) => session.current);
    expect(currentSession).toBeTruthy();
    expect(currentSession?.label).toBe("Laptop");

    const otherSession = sessions.find((session) => !session.current);
    expect(otherSession).toBeTruthy();
    expect(otherSession?.label).toBe("Phone");

    const revokeResponse = await apiRequest(`/api/auth/sessions/${otherSession?.id ?? ""}`, {
      method: "DELETE",
      headers: {
        Cookie: currentCookie
      }
    });
    expect(revokeResponse.status).toBe(204);

    const meWithOtherCookie = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: otherCookie
      }
    });
    expect(meWithOtherCookie.status).toBe(401);
  });

  it("logs out other sessions while keeping current session active", async () => {
    const currentCookie = await login({
      username: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent A",
      deviceLabel: "Desktop"
    });
    const otherCookieOne = await login({
      username: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent B",
      deviceLabel: "Tablet"
    });
    const otherCookieTwo = await login({
      username: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent C",
      deviceLabel: "Phone"
    });

    const logoutOthersResponse = await apiRequest("/api/auth/logout-others", {
      method: "POST",
      headers: {
        Cookie: currentCookie
      }
    });
    expect(logoutOthersResponse.status).toBe(200);
    expect(logoutOthersResponse.payload).toEqual({ revoked: 2 });

    const meWithCurrentCookie = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: currentCookie
      }
    });
    expect(meWithCurrentCookie.status).toBe(200);

    const meWithOtherCookieOne = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: otherCookieOne
      }
    });
    expect(meWithOtherCookieOne.status).toBe(401);

    const meWithOtherCookieTwo = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: otherCookieTwo
      }
    });
    expect(meWithOtherCookieTwo.status).toBe(401);
  });

  it("allows revoking current session and clears cookie", async () => {
    const currentCookie = await login({
      username: "admin",
      password: "admin-secret-123",
      userAgent: "Session Test Agent Current",
      deviceLabel: "Current Session"
    });

    const sessionsResponse = await apiRequest("/api/auth/sessions", {
      method: "GET",
      headers: {
        Cookie: currentCookie
      }
    });
    expect(sessionsResponse.status).toBe(200);

    const sessions = (sessionsResponse.payload as { sessions: Array<{ id: string; current: boolean }> }).sessions;
    const currentSession = sessions.find((session) => session.current);
    expect(currentSession).toBeTruthy();

    const revokeResponse = await apiRequest(`/api/auth/sessions/${currentSession?.id ?? ""}`, {
      method: "DELETE",
      headers: {
        Cookie: currentCookie
      }
    });

    expect(revokeResponse.status).toBe(204);
    expect(revokeResponse.cookie).toContain("flaque_session=");

    const meResponse = await apiRequest("/api/auth/me", {
      method: "GET",
      headers: {
        Cookie: currentCookie
      }
    });
    expect(meResponse.status).toBe(401);
  });
});
