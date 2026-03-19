import fs from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryIndex, Track } from "../types/library";

let dataRoot = "";
let baseUrl = "";
let server: Server | null = null;

function createTrack(id: string, relativePath: string): Track {
  return {
    id,
    owner: "owner-1",
    path: relativePath,
    duration: 180,
    mimeType: "audio/mpeg",
    codec: "mp3",
    tags: {
      title: id,
      artist: "Artist",
      album: "Album"
    }
  };
}

class FakeIndexStore {
  private snapshot: LibraryIndex;

  constructor(snapshot: LibraryIndex) {
    this.snapshot = snapshot;
  }

  getSnapshot(): LibraryIndex {
    return this.snapshot;
  }

  getTrackById(trackId: string): Track | undefined {
    return this.snapshot.tracks.find((track) => track.id === trackId);
  }

  async rebuild(): Promise<LibraryIndex> {
    const { scanFilesystemPlaylists } = await import("../services/playlists/playlistStore");
    const playlists = await scanFilesystemPlaylists(this.snapshot.tracks);
    this.snapshot = {
      generatedAt: new Date().toISOString(),
      totalTracks: this.snapshot.tracks.length,
      tracks: this.snapshot.tracks,
      playlists
    };
    return this.snapshot;
  }

  async refreshPlaylists(): Promise<LibraryIndex> {
    return this.rebuild();
  }
}

async function bootstrapServer(indexStore: FakeIndexStore): Promise<void> {
  vi.resetModules();

  const { ensureBaseDirectories } = await import("../utils/fs");
  const { createUser, ensureDefaultAdmin, initializeAuthDatabase } = await import("../auth/db");
  const { createApp } = await import("../app");

  await ensureBaseDirectories();
  initializeAuthDatabase();
  ensureDefaultAdmin();
  createUser("alice", "alice-password", "user");

  const app = createApp(indexStore as unknown as import("../services/indexer/indexStore").IndexStore);
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
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "flaque-playlist-routes-"));
  process.env.DATA_ROOT = dataRoot;
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "admin-secret-123";
  process.env.CORS_ORIGIN = "http://localhost:5173";
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
  it("supports playlist CRUD with file-based storage", async () => {
    const indexStore = new FakeIndexStore({
      generatedAt: new Date().toISOString(),
      totalTracks: 2,
      tracks: [
        createTrack("track-a", "storage/users/owner-1/uploads/a.mp3"),
        createTrack("track-b", "storage/users/owner-1/uploads/b.mp3")
      ],
      playlists: []
    });

    await bootstrapServer(indexStore);

    const adminCookie = await login("admin", "admin-secret-123");

    const createResponse = await apiRequest("/api/playlists", {
      method: "POST",
      headers: { Cookie: adminCookie },
      body: JSON.stringify({
        name: "My Playlist",
        visibility: "private",
        trackIds: ["track-a", "track-b"]
      })
    });

    expect(createResponse.status).toBe(201);
    const createdPlaylist = (createResponse.payload as { playlist: { id: string; authorId: string } }).playlist;
    expect(createResponse.payload).toEqual(
      expect.objectContaining({
        playlist: expect.objectContaining({
          id: expect.stringMatching(/.+:my-playlist$/),
          name: "My Playlist",
          visibility: "private",
          trackIds: ["track-a", "track-b"]
        })
      })
    );

    const metadataPath = path.join(
      dataRoot,
      "storage",
      "users",
      createdPlaylist.authorId,
      "playlists",
      "my-playlist",
      "playlist.json"
    );
    const metadataRaw = await fs.readFile(metadataPath, "utf8");
    expect(JSON.parse(metadataRaw)).toEqual({
      name: "My Playlist",
      visibility: "private"
    });

    const updateResponse = await apiRequest(`/api/playlists/${encodeURIComponent(createdPlaylist.id)}`, {
      method: "PATCH",
      headers: { Cookie: adminCookie },
      body: JSON.stringify({
        visibility: "public",
        trackIds: ["track-b"]
      })
    });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.payload).toEqual(
      expect.objectContaining({
        playlist: expect.objectContaining({
          id: createdPlaylist.id,
          name: "My Playlist",
          visibility: "public",
          trackIds: ["track-b"]
        })
      })
    );

    const listResponse = await apiRequest("/api/playlists", {
      method: "GET",
      headers: { Cookie: adminCookie }
    });
    expect(listResponse.status).toBe(200);
    expect(listResponse.payload).toEqual(
      expect.objectContaining({
        playlists: expect.arrayContaining([
          expect.objectContaining({ id: createdPlaylist.id, visibility: "public" })
        ])
      })
    );

    const deleteResponse = await apiRequest(`/api/playlists/${encodeURIComponent(createdPlaylist.id)}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie }
    });
    expect(deleteResponse.status).toBe(204);
  });

  it("hides private playlists from other users", async () => {
    const indexStore = new FakeIndexStore({
      generatedAt: new Date().toISOString(),
      totalTracks: 1,
      tracks: [createTrack("track-a", "storage/users/owner-1/uploads/a.mp3")],
      playlists: []
    });

    await bootstrapServer(indexStore);

    const adminCookie = await login("admin", "admin-secret-123");
    const aliceCookie = await login("alice", "alice-password");

    const createResponse = await apiRequest("/api/playlists", {
      method: "POST",
      headers: { Cookie: adminCookie },
      body: JSON.stringify({
        name: "Admin Private",
        visibility: "private",
        trackIds: ["track-a"]
      })
    });
    expect(createResponse.status).toBe(201);
    const createdPlaylist = (createResponse.payload as { playlist: { id: string } }).playlist;

    const listAsAlice = await apiRequest("/api/playlists", {
      method: "GET",
      headers: { Cookie: aliceCookie }
    });
    expect(listAsAlice.status).toBe(200);
    expect(listAsAlice.payload).toEqual(
      expect.objectContaining({
        playlists: []
      })
    );

    const getAsAlice = await apiRequest(`/api/playlists/${encodeURIComponent(createdPlaylist.id)}`, {
      method: "GET",
      headers: { Cookie: aliceCookie }
    });
    expect(getAsAlice.status).toBe(403);
  });
});
