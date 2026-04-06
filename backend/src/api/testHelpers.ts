import fs from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";

import { expect, vi } from "vitest";

import type { IndexStore } from "../services/indexer/indexStore";

type TestServerContext = {
  dataRoot: string;
  baseUrl: string;
  server: Server;
};

let ctx: TestServerContext | null = null;

export function getBaseUrl(): string {
  if (!ctx) throw new Error("Test server not initialized");
  return ctx.baseUrl;
}

export function getDataRoot(): string {
  if (!ctx) throw new Error("Test server not initialized");
  return ctx.dataRoot;
}

export type BootstrapOptions = {
  tempDirPrefix: string;
  indexStore?: unknown;
  beforeInit?: () => Promise<void> | void;
};

export async function setupTestServer(options: BootstrapOptions): Promise<void> {
  vi.resetModules();

  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), options.tempDirPrefix));
  process.env.DATA_ROOT = dataRoot;
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "admin-secret-123";
  process.env.ADMIN_EMAIL = "admin@test.local";
  process.env.CORS_ORIGIN = "http://localhost:5173";

  const { ensureBaseDirectories } = await import("../utils/fs");
  const { initializeAuthDatabase, ensureDefaultAdmin } = await import("../auth/db");
  const { createApp } = await import("../app");

  await ensureBaseDirectories();
  initializeAuthDatabase();
  ensureDefaultAdmin();

  if (options.beforeInit) {
    await options.beforeInit();
  }

  let indexStore: IndexStore;
  if (options.indexStore) {
    indexStore = options.indexStore as IndexStore;
  } else {
    const { IndexStore: IndexStoreClass } = await import("../services/indexer/indexStore");
    const store = new IndexStoreClass();
    await store.initialize();
    indexStore = store;
  }

  const app = createApp(indexStore);
  const server = createServer(app);

  const baseUrl = await new Promise<string>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to resolve test server address"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

  ctx = { dataRoot, baseUrl, server };
}

export async function teardownTestServer(): Promise<void> {
  if (!ctx) return;

  const { dataRoot, server } = ctx;
  ctx = null;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  await fs.rm(dataRoot, { recursive: true, force: true });
  vi.resetModules();
}

export type ApiResponse = {
  status: number;
  payload: unknown;
  cookie: string | null;
  retryAfter: string | null;
};

export async function apiRequest(pathname: string, options: RequestInit = {}): Promise<ApiResponse> {
  const response = await fetch(`${getBaseUrl()}${pathname}`, {
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
    cookie: response.headers.get("set-cookie"),
    retryAfter: response.headers.get("retry-after")
  };
}

export async function login(username: string, password: string): Promise<string> {
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

export async function loginWithOptions(input: {
  login: string;
  password: string;
  userAgent?: string;
  deviceLabel?: string;
}): Promise<string> {
  const response = await apiRequest("/api/auth/login", {
    method: "POST",
    headers: input.userAgent ? { "User-Agent": input.userAgent } : undefined,
    body: JSON.stringify({
      login: input.login,
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
