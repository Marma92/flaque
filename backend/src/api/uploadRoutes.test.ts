import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  apiRequest,
  getBaseUrl,
  getDataRoot,
  login,
  setupTestServer,
  teardownTestServer
} from "./testHelpers";

function tmpUploadsDir(): string {
  return path.join(getDataRoot(), "cache", "tmp-uploads");
}

async function postForm(
  pathname: string,
  cookie: string | null,
  form: FormData
): Promise<{ status: number; payload: unknown }> {
  const headers: Record<string, string> = {};
  if (cookie) {
    headers.Cookie = cookie;
  }
  const response = await fetch(`${getBaseUrl()}${pathname}`, {
    method: "POST",
    headers,
    body: form
  });

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

async function createSecondUser(
  adminCookie: string,
  username: string,
  password: string
): Promise<string> {
  const createRes = await apiRequest("/api/users", {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: JSON.stringify({
      username,
      password,
      email: `${username}@test.local`,
      role: "user"
    })
  });
  expect(createRes.status).toBe(201);
  return login(username, password);
}

describe("uploadRoutes", () => {
  let cookie: string;

  beforeEach(async () => {
    await setupTestServer({ tempDirPrefix: "flaque-upload-api-" });
    cookie = await login("admin", "admin-secret-123");
  });

  afterEach(async () => {
    await teardownTestServer();
  });

  describe("GET /api/upload/chunk-size", () => {
    it("returns the configured chunk size", async () => {
      const res = await apiRequest("/api/upload/chunk-size", { headers: { Cookie: cookie } });
      expect(res.status).toBe(200);
      const body = res.payload as { chunkSize: number };
      expect(body.chunkSize).toBeGreaterThan(0);
    });
  });

  describe("GET /api/recent-uploads", () => {
    it("returns an empty list when no tracks have been uploaded", async () => {
      const res = await apiRequest("/api/recent-uploads", { headers: { Cookie: cookie } });
      expect(res.status).toBe(200);
      const body = res.payload as { tracks: unknown[] };
      expect(Array.isArray(body.tracks)).toBe(true);
      expect(body.tracks).toHaveLength(0);
    });
  });

  describe("POST /api/upload/chunked/init", () => {
    it("requires authentication", async () => {
      const res = await apiRequest("/api/upload/chunked/init", {
        method: "POST",
        body: JSON.stringify({ fileName: "song.flac", fileSize: 1024 })
      });
      expect(res.status).toBe(401);
    });

    it("rejects when fileName is missing", async () => {
      const res = await apiRequest("/api/upload/chunked/init", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ fileSize: 1024 })
      });
      expect(res.status).toBe(400);
    });

    it("rejects when fileSize is missing or non-positive", async () => {
      const res = await apiRequest("/api/upload/chunked/init", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ fileName: "song.flac", fileSize: 0 })
      });
      expect(res.status).toBe(400);
    });

    it("rejects unsupported audio formats", async () => {
      const res = await apiRequest("/api/upload/chunked/init", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ fileName: "doc.pdf", fileSize: 1024 })
      });
      expect(res.status).toBe(400);
    });

    it("rejects files exceeding the max upload size", async () => {
      const res = await apiRequest("/api/upload/chunked/init", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ fileName: "big.flac", fileSize: 5_000_000_000 })
      });
      expect(res.status).toBe(413);
    });

    it("creates a session and returns chunking parameters", async () => {
      const res = await apiRequest("/api/upload/chunked/init", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ fileName: "song.flac", fileSize: 1024 })
      });
      expect(res.status).toBe(200);
      const body = res.payload as { sessionId: string; chunkSize: number; totalChunks: number };
      expect(body.sessionId).toBeTruthy();
      expect(body.chunkSize).toBeGreaterThan(0);
      expect(body.totalChunks).toBe(1);
    });
  });

  describe("POST /api/upload/chunked/chunk", () => {
    it("rejects when sessionId is missing", async () => {
      const form = new FormData();
      form.set("chunk", new Blob([new Uint8Array([1, 2, 3])]), "chunk");
      form.set("chunkIndex", "0");
      const res = await postForm("/api/upload/chunked/chunk", cookie, form);
      expect(res.status).toBe(400);
      expect((res.payload as { error: string }).error).toMatch(/sessionId/);
    });

    it("rejects when chunkIndex is missing", async () => {
      const form = new FormData();
      form.set("chunk", new Blob([new Uint8Array([1, 2, 3])]), "chunk");
      form.set("sessionId", "nonexistent");
      const res = await postForm("/api/upload/chunked/chunk", cookie, form);
      expect(res.status).toBe(400);
      expect((res.payload as { error: string }).error).toMatch(/chunkIndex/);
    });

    it("rejects when chunk body is missing", async () => {
      const form = new FormData();
      form.set("sessionId", "nonexistent");
      form.set("chunkIndex", "0");
      const res = await postForm("/api/upload/chunked/chunk", cookie, form);
      expect(res.status).toBe(400);
      expect((res.payload as { error: string }).error).toMatch(/Chunk data/);
    });
  });

  describe("POST /api/upload/chunked/complete", () => {
    it("rejects when sessionId is missing", async () => {
      const res = await apiRequest("/api/upload/chunked/complete", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for an unknown sessionId", async () => {
      const res = await apiRequest("/api/upload/chunked/complete", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ sessionId: "does-not-exist" })
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/upload/chunked/cancel", () => {
    it("rejects when sessionId is missing", async () => {
      const res = await apiRequest("/api/upload/chunked/cancel", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
    });

    it("cancels an existing session and is idempotent", async () => {
      const initRes = await apiRequest("/api/upload/chunked/init", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ fileName: "song.flac", fileSize: 1024 })
      });
      const { sessionId } = initRes.payload as { sessionId: string };

      const firstCancel = await apiRequest("/api/upload/chunked/cancel", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ sessionId })
      });
      expect(firstCancel.status).toBe(200);
      expect((firstCancel.payload as { cancelled: boolean }).cancelled).toBe(true);

      const secondCancel = await apiRequest("/api/upload/chunked/cancel", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ sessionId })
      });
      expect(secondCancel.status).toBe(200);
    });
  });

  describe("cross-user chunked session access", () => {
    it("returns 403 when another user tries to cancel or complete the session", async () => {
      const initRes = await apiRequest("/api/upload/chunked/init", {
        method: "POST",
        headers: { Cookie: cookie },
        body: JSON.stringify({ fileName: "song.flac", fileSize: 1024 })
      });
      const { sessionId } = initRes.payload as { sessionId: string };

      const otherCookie = await createSecondUser(cookie, "intruder", "intruder-pass-123");

      const cancelRes = await apiRequest("/api/upload/chunked/cancel", {
        method: "POST",
        headers: { Cookie: otherCookie },
        body: JSON.stringify({ sessionId })
      });
      expect(cancelRes.status).toBe(403);

      const completeRes = await apiRequest("/api/upload/chunked/complete", {
        method: "POST",
        headers: { Cookie: otherCookie },
        body: JSON.stringify({ sessionId })
      });
      expect(completeRes.status).toBe(403);
    });
  });

  describe("POST /api/upload", () => {
    it("rejects requests without any files", async () => {
      const form = new FormData();
      const res = await postForm("/api/upload", cookie, form);
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/upload/finalize", () => {
    it("rejects requests with no file and no tempPath", async () => {
      const form = new FormData();
      const res = await postForm("/api/upload/finalize", cookie, form);
      expect(res.status).toBe(400);
    });

    it("rejects a tempPath that lies outside tmpUploadsRoot", async () => {
      const form = new FormData();
      form.set("tempPath", "/etc/passwd");
      form.set("fileName", "song.flac");
      const res = await postForm("/api/upload/finalize", cookie, form);
      expect(res.status).toBe(400);
      expect((res.payload as { error: string }).error).toMatch(/Invalid tempPath/);
    });

    it("rejects a tempPath that attempts path traversal", async () => {
      const traversal = path.join(tmpUploadsDir(), "..", "..", "etc", "passwd");
      const form = new FormData();
      form.set("tempPath", traversal);
      form.set("fileName", "passwd.flac");
      const res = await postForm("/api/upload/finalize", cookie, form);
      expect(res.status).toBe(400);
    });

    it("returns 404 when tempPath points to a file that does not exist", async () => {
      const form = new FormData();
      form.set("tempPath", path.join(tmpUploadsDir(), "ghost.flac"));
      form.set("fileName", "ghost.flac");
      const res = await postForm("/api/upload/finalize", cookie, form);
      expect(res.status).toBe(404);
    });

    it("rejects a tempPath whose file has an unsupported extension", async () => {
      await fs.mkdir(tmpUploadsDir(), { recursive: true });
      const badPath = path.join(tmpUploadsDir(), "readme.txt");
      await fs.writeFile(badPath, "not audio");

      const form = new FormData();
      form.set("tempPath", badPath);
      form.set("fileName", "readme.txt");
      const res = await postForm("/api/upload/finalize", cookie, form);
      expect(res.status).toBe(400);
      expect((res.payload as { error: string }).error).toMatch(/Unsupported audio format/);
    });
  });
});
