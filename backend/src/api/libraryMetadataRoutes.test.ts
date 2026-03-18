import fs from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryIndex, Track } from "../types/library";

let dataRoot = "";
let baseUrl = "";
let server: Server | null = null;

type FakeIndexStoreOptions = {
  initialSnapshot: LibraryIndex;
  rebuildSnapshot: LibraryIndex;
};

class FakeIndexStore {
  private snapshot: LibraryIndex;

  private readonly rebuildSnapshot: LibraryIndex;

  constructor(options: FakeIndexStoreOptions) {
    this.snapshot = options.initialSnapshot;
    this.rebuildSnapshot = options.rebuildSnapshot;
  }

  getSnapshot(): LibraryIndex {
    return this.snapshot;
  }

  getTrackById(trackId: string): Track | undefined {
    return this.snapshot.tracks.find((track) => track.id === trackId);
  }

  async rebuild(): Promise<LibraryIndex> {
    this.snapshot = this.rebuildSnapshot;
    return this.rebuildSnapshot;
  }
}

async function bootstrapServer(indexStore: FakeIndexStore): Promise<void> {
  vi.resetModules();

  const { ensureBaseDirectories } = await import("../utils/fs");
  const { initializeAuthDatabase, ensureDefaultAdmin } = await import("../auth/db");
  const { createApp } = await import("../app");

  await ensureBaseDirectories();
  initializeAuthDatabase();
  ensureDefaultAdmin();

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

function createTrack(id: string, title: string): Track {
  return {
    id,
    owner: "owner-1",
    path: "storage/users/owner-1/uploads/test.flac",
    duration: 120,
    mimeType: "audio/flac",
    codec: "flac",
    tags: {
      title,
      artist: "Artist",
      album: "Album"
    },
    cover: `/api/covers/${id}`
  };
}

function createNestedTrack(id: string, title: string, artist: string, album: string, relativePath: string): Track {
  return {
    id,
    owner: "owner-1",
    path: relativePath,
    duration: 120,
    mimeType: "audio/flac",
    codec: "flac",
    tags: {
      title,
      artist,
      album
    },
    cover: `/api/covers/${id}`
  };
}

beforeEach(async () => {
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "flaque-metadata-routes-"));
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

describe("library metadata routes", () => {
  it("accepts metadata patch on /tracks/:id/metadata", async () => {
    const track = createTrack("track-1", "Original");
    const snapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 1,
      tracks: [track]
    };

    const indexStore = new FakeIndexStore({
      initialSnapshot: snapshot,
      rebuildSnapshot: snapshot
    });

    await bootstrapServer(indexStore);

    const cookie = await login("admin", "admin-secret-123");

    const patchResponse = await apiRequest(`/api/tracks/${encodeURIComponent(track.id)}/metadata`, {
      method: "PATCH",
      headers: {
        Cookie: cookie
      },
      body: JSON.stringify({ title: "Updated" })
    });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.payload).toEqual(
      expect.objectContaining({
        track: expect.objectContaining({
          id: track.id
        })
      })
    );
  });

  it("does not return 404 when rebuild omits an existing track", async () => {
    const track = createTrack("track-2", "Original 2");
    const initialSnapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 1,
      tracks: [track]
    };
    const rebuiltWithoutTrack: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 0,
      tracks: []
    };

    const indexStore = new FakeIndexStore({
      initialSnapshot,
      rebuildSnapshot: rebuiltWithoutTrack
    });

    await bootstrapServer(indexStore);

    const cookie = await login("admin", "admin-secret-123");

    const patchResponse = await apiRequest(`/api/tracks/${encodeURIComponent(track.id)}/metadata`, {
      method: "PATCH",
      headers: {
        Cookie: cookie
      },
      body: JSON.stringify({ title: "Fallback title" })
    });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.payload).toEqual(
      expect.objectContaining({
        warning: expect.any(String),
        track: expect.objectContaining({
          id: track.id,
          tags: expect.objectContaining({
            title: "Fallback title"
          })
        })
      })
    );
  });

  it("supports metadata patch on /tracks/:id for compatibility", async () => {
    const track = createTrack("track-3", "Original 3");
    const snapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 1,
      tracks: [track]
    };

    const indexStore = new FakeIndexStore({
      initialSnapshot: snapshot,
      rebuildSnapshot: snapshot
    });

    await bootstrapServer(indexStore);

    const cookie = await login("admin", "admin-secret-123");

    const patchResponse = await apiRequest(`/api/tracks/${encodeURIComponent(track.id)}`, {
      method: "PATCH",
      headers: {
        Cookie: cookie
      },
      body: JSON.stringify({ artist: "New Artist" })
    });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.payload).toEqual(
      expect.objectContaining({
        track: expect.objectContaining({
          id: track.id
        })
      })
    );
  });

  it("returns artist photos and album covers from metadata routes", async () => {
    const artist = "The Beatles";
    const album = "Abbey Road";
    const artistSlug = "the_beatles";
    const albumSlug = "abbey_road";
    const artistPhotoPath = `storage/users/owner-1/uploads/${artistSlug}/artist-photo.jpg`;
    const albumCoverPath = `storage/users/owner-1/uploads/${artistSlug}/${albumSlug}/album-cover.jpg`;

    const track = createNestedTrack(
      "track-4",
      "Come Together",
      artist,
      album,
      `storage/users/owner-1/uploads/${artistSlug}/${albumSlug}/come-together.flac`
    );

    const snapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 1,
      tracks: [track]
    };

    const artistDir = path.join(dataRoot, "storage", "users", "owner-1", "uploads", artistSlug);
    const albumDir = path.join(artistDir, albumSlug);
    await fs.mkdir(albumDir, { recursive: true });
    await fs.writeFile(path.join(artistDir, "artist.json"), JSON.stringify({ name: artist, photo: { path: artistPhotoPath } }));
    await fs.writeFile(path.join(albumDir, "album.json"), JSON.stringify({ name: album, cover: { path: albumCoverPath } }));
    await fs.writeFile(path.join(artistDir, "artist-photo.jpg"), "artist-photo");
    await fs.writeFile(path.join(albumDir, "album-cover.jpg"), "album-cover");

    const indexStore = new FakeIndexStore({
      initialSnapshot: snapshot,
      rebuildSnapshot: snapshot
    });

    await bootstrapServer(indexStore);
    const cookie = await login("admin", "admin-secret-123");

    const artistsResponse = await apiRequest("/api/artists", {
      headers: {
        Cookie: cookie
      }
    });

    expect(artistsResponse.status).toBe(200);
    expect(artistsResponse.payload).toEqual(
      expect.objectContaining({
        artists: expect.arrayContaining([
          expect.objectContaining({
            name: artist,
            photo: artistPhotoPath
          })
        ])
      })
    );

    const albumsResponse = await apiRequest("/api/albums", {
      headers: {
        Cookie: cookie
      }
    });

    expect(albumsResponse.status).toBe(200);
    expect(albumsResponse.payload).toEqual(
      expect.objectContaining({
        albums: expect.arrayContaining([
          expect.objectContaining({
            name: album,
            artist,
            cover: albumCoverPath
          })
        ])
      })
    );
  });
});
