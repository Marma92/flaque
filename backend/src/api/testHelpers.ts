import fs from "node:fs/promises";
import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { Duplex } from "node:stream";

import type express from "express";
import { expect, vi } from "vitest";

import type { IndexStore } from "../services/indexer/indexStore";

type TestServerContext = {
  dataRoot: string;
  app: express.Express;
};

let ctx: TestServerContext | null = null;

export function getBaseUrl(): string {
  return "http://flaque.test";
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

class MockSocket extends Duplex {
  remoteAddress = "127.0.0.1";
  encrypted = false;

  override _read(): void {}

  override _write(
    _chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    callback();
  }

  override destroy(error?: Error): this {
    if (error) {
      this.emit("error", error);
    }
    return super.destroy();
  }

  setTimeout(): this {
    return this;
  }

  setNoDelay(): this {
    return this;
  }

  setKeepAlive(): this {
    return this;
  }
}

type TestResponse = {
  status: number;
  headers: Headers;
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
};

function normalizeBodyChunk(chunk: Buffer | string, encoding?: BufferEncoding): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return Buffer.from(chunk);
  }

  return Buffer.from(chunk, encoding ?? "utf8");
}

async function invokeApp(pathname: string, options: RequestInit = {}): Promise<TestResponse> {
  if (!ctx) {
    throw new Error("Test server not initialized");
  }

  const request = new Request(`${getBaseUrl()}${pathname}`, options);
  const requestBody = request.body ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);
  const requestHeaders = new Headers(request.headers);
  const app = ctx.app as unknown as {
    handle: (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void;
  };

  if (!requestHeaders.has("host")) {
    requestHeaders.set("host", new URL(getBaseUrl()).host);
  }
  if (requestBody.length > 0 && !requestHeaders.has("content-length")) {
    requestHeaders.set("content-length", String(requestBody.length));
  }

  const socket = new MockSocket() as unknown as Socket;
  const req = new IncomingMessage(socket);
  req.url = pathname;
  req.method = request.method;
  req.headers = Object.fromEntries(requestHeaders.entries());
  req.connection = socket;
  req.socket = socket;
  req.push(requestBody);
  req.push(null);

  const res = new ServerResponse(req);
  res.assignSocket(socket);

  const bodyChunks: Buffer[] = [];
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  res.write = ((chunk: Buffer | string, encoding?: BufferEncoding, callback?: (error?: Error | null) => void) => {
    if (chunk) {
      bodyChunks.push(normalizeBodyChunk(chunk, encoding));
    }

    if (encoding !== undefined) {
      return originalWrite(chunk, encoding, callback);
    }

    return callback ? originalWrite(chunk, callback) : originalWrite(chunk);
  }) as typeof res.write;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const settle = (callback: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
    };

    res.end = ((chunk?: Buffer | string, encoding?: BufferEncoding, callback?: () => void) => {
      if (chunk) {
        bodyChunks.push(normalizeBodyChunk(chunk, encoding));
      }

      const result =
        encoding !== undefined
          ? originalEnd(chunk, encoding, callback)
          : callback
            ? originalEnd(chunk, callback)
            : originalEnd(chunk);
      queueMicrotask(() => {
        settle(resolve);
      });
      return result;
    }) as typeof res.end;

    res.on("error", (error) => {
      settle(() => reject(error));
    });

    app.handle(req, res, (error?: unknown) => {
      if (error instanceof Error) {
        settle(() => reject(error));
        return;
      }

      settle(() => resolve());
    });
  });

  const responseHeaders = new Headers();
  for (const [key, value] of Object.entries(res.getHeaders())) {
    if (Array.isArray(value)) {
      for (const item of value) {
        responseHeaders.append(key, String(item));
      }
      continue;
    }

    if (value !== undefined) {
      responseHeaders.set(key, String(value));
    }
  }

  const responseBody = Buffer.concat(bodyChunks);

  return {
    status: res.statusCode,
    headers: responseHeaders,
    async text() {
      return responseBody.toString("utf8");
    },
    async json() {
      const text = responseBody.toString("utf8");
      return text ? (JSON.parse(text) as unknown) : undefined;
    },
    async arrayBuffer() {
      return responseBody.buffer.slice(
        responseBody.byteOffset,
        responseBody.byteOffset + responseBody.byteLength
      );
    }
  };
}

export async function setupTestServer(options: BootstrapOptions): Promise<void> {
  vi.resetModules();

  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), options.tempDirPrefix));
  process.env.DATA_ROOT = dataRoot;
  process.env.CORS_ORIGIN = "http://localhost:5173";

  const { ensureBaseDirectories } = await import("../utils/fs");
  const { initializeAuthDatabase, ensureDefaultAdmin, findUserByUsername, updateUserEmail, updateUserPassword } = await import("../auth/db");
  const { createApp } = await import("../app");

  await ensureBaseDirectories();
  initializeAuthDatabase();
  ensureDefaultAdmin();
  const adminUser = findUserByUsername("admin");
  if (adminUser) {
    updateUserEmail(adminUser.id, "admin@test.local");
    updateUserPassword(adminUser.id, "admin-secret-123");
  }

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
  ctx = { dataRoot, app };
}

export async function teardownTestServer(): Promise<void> {
  if (!ctx) return;

  const { dataRoot } = ctx;
  ctx = null;

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
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await invokeApp(pathname, {
    ...options,
    headers
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

export async function fetchApi(pathname: string, options: RequestInit = {}): Promise<TestResponse> {
  return invokeApp(pathname, options);
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
