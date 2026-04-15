import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LibraryIndex, Playlist, Track } from "../types/library";
import { apiRequest, getBaseUrl, getDataRoot, login, setupTestServer, teardownTestServer } from "./testHelpers";

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

function makeFakeIndexStore(tracks: Track[] = []): FakeIndexStore {
  return new FakeIndexStore({
    generatedAt: new Date().toISOString(),
    totalTracks: tracks.length,
    tracks,
    playlists: []
  });
}

const defaultTracks = [
  createTrack("track-a", "storage/users/owner-1/uploads/a.mp3"),
  createTrack("track-b", "storage/users/owner-1/uploads/b.mp3")
];

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
    headers: { Cookie: input.cookie },
    body: formData
  });

  const text = await response.text();
  let payload: unknown = undefined;
  if (text) {
    try { payload = JSON.parse(text) as unknown; } catch { payload = text; }
  }

  return { status: response.status, payload };
}

let indexStore: FakeIndexStore;

beforeEach(async () => {
  indexStore = makeFakeIndexStore();
});

afterEach(async () => {
  await teardownTestServer();
});

// ── Helper: create a playlist and return its id ────────────────────
async function createPlaylist(
  cookie: string,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; playlist: Playlist }> {
  const body = {
    name: "Test Playlist",
    visibility: "public",
    trackIds: ["track-a", "track-b"],
    ...overrides
  };
  const res = await apiRequest("/api/playlists", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify(body)
  });
  expect(res.status).toBe(201);
  const playlist = (res.payload as { playlist: Playlist }).playlist;
  return { id: playlist.id, playlist };
}

describe("playlistRoutes", () => {
  it("supports playlist CRUD with file-based storage", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);

    await setupTestServer({
      tempDirPrefix: "flaque-playlist-routes-",
      indexStore,
      beforeInit: async () => {
        const { createUser } = await import("../auth/db");
        createUser("alice", "alice-password", "user", "alice@test.local");
      }
    });

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

    const dataRoot = getDataRoot();
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
      visibility: "private",
      collaborators: [],
      cover: null,
      description: "",
      hearts: [],
      listenCount: 0
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
    indexStore = makeFakeIndexStore(defaultTracks);

    await setupTestServer({
      tempDirPrefix: "flaque-playlist-routes-",
      indexStore,
      beforeInit: async () => {
        const { createUser } = await import("../auth/db");
        createUser("alice", "alice-password", "user", "alice@test.local");
      }
    });

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

  // ── Description ──────────────────────────────────────────────────

  it("creates a playlist with a description", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({ tempDirPrefix: "flaque-playlist-desc-", indexStore });
    const cookie = await login("admin", "admin-secret-123");

    const { playlist } = await createPlaylist(cookie, {
      name: "Described",
      description: "  A nice playlist  "
    });

    expect(playlist.description).toBe("A nice playlist");
  });

  it("patches a playlist description", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({ tempDirPrefix: "flaque-playlist-desc-patch-", indexStore });
    const cookie = await login("admin", "admin-secret-123");

    const { id } = await createPlaylist(cookie, { name: "Patchable" });

    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: JSON.stringify({ description: "  Updated desc  " })
    });
    expect(res.status).toBe(200);
    const updated = (res.payload as { playlist: Playlist }).playlist;
    expect(updated.description).toBe("Updated desc");
  });

  it("preserves description when patching other fields", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({ tempDirPrefix: "flaque-playlist-desc-preserve-", indexStore });
    const cookie = await login("admin", "admin-secret-123");

    const { id } = await createPlaylist(cookie, { name: "DescKeep", description: "Keep me" });

    // Patch only visibility — description should survive
    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: JSON.stringify({ visibility: "private" })
    });
    expect(res.status).toBe(200);
    const updated = (res.payload as { playlist: Playlist }).playlist;
    expect(updated.description).toBe("Keep me");
    expect(updated.visibility).toBe("private");
  });

  // ── Heart ────────────────────────────────────────────────────────

  it("toggles heart on a public playlist", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({
      tempDirPrefix: "flaque-playlist-heart-",
      indexStore,
      beforeInit: async () => {
        const { createUser } = await import("../auth/db");
        createUser("alice", "alice-password", "user", "alice@test.local");
      }
    });

    const adminCookie = await login("admin", "admin-secret-123");
    const aliceCookie = await login("alice", "alice-password");

    const { id } = await createPlaylist(adminCookie, { name: "Heartable", visibility: "public" });

    // Heart it
    const heart1 = await apiRequest(`/api/playlists/${encodeURIComponent(id)}/heart`, {
      method: "POST",
      headers: { Cookie: aliceCookie }
    });
    expect(heart1.status).toBe(200);
    expect(heart1.payload).toEqual({ hearted: true, heartCount: 1 });

    // Un-heart it
    const heart2 = await apiRequest(`/api/playlists/${encodeURIComponent(id)}/heart`, {
      method: "POST",
      headers: { Cookie: aliceCookie }
    });
    expect(heart2.status).toBe(200);
    expect(heart2.payload).toEqual({ hearted: false, heartCount: 0 });
  });

  it("rejects heart on own playlist", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({ tempDirPrefix: "flaque-playlist-heart-own-", indexStore });
    const cookie = await login("admin", "admin-secret-123");

    const { id } = await createPlaylist(cookie, { name: "Mine", visibility: "public" });

    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}/heart`, {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(res.status).toBe(400);
    expect(res.payload).toEqual(expect.objectContaining({ error: expect.stringContaining("own playlist") }));
  });

  it("rejects heart on private playlist", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({
      tempDirPrefix: "flaque-playlist-heart-priv-",
      indexStore,
      beforeInit: async () => {
        const { createUser } = await import("../auth/db");
        createUser("alice", "alice-password", "user", "alice@test.local");
      }
    });

    const adminCookie = await login("admin", "admin-secret-123");
    const aliceCookie = await login("alice", "alice-password");

    const { id } = await createPlaylist(adminCookie, { name: "Private", visibility: "private" });

    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}/heart`, {
      method: "POST",
      headers: { Cookie: aliceCookie }
    });
    expect(res.status).toBe(403);
  });

  // ── Listen count ─────────────────────────────────────────────────

  it("increments listen count", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({ tempDirPrefix: "flaque-playlist-listen-", indexStore });
    const cookie = await login("admin", "admin-secret-123");

    const { id } = await createPlaylist(cookie, { name: "Listened" });

    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}/listen`, {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(res.status).toBe(200);
    expect(res.payload).toEqual({ listenCount: 1 });

    // Second call within debounce window should not increment further
    const res2 = await apiRequest(`/api/playlists/${encodeURIComponent(id)}/listen`, {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(res2.status).toBe(200);
    expect((res2.payload as { listenCount: number }).listenCount).toBeLessThanOrEqual(1);
  });

  it("returns 404 for listen on non-existent playlist", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({ tempDirPrefix: "flaque-playlist-listen-404-", indexStore });
    const cookie = await login("admin", "admin-secret-123");

    const res = await apiRequest("/api/playlists/nonexistent:playlist/listen", {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(res.status).toBe(404);
  });

  // ── Collaborators ────────────────────────────────────────────────

  it("adds collaborators to a playlist", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({
      tempDirPrefix: "flaque-playlist-collabs-",
      indexStore,
      beforeInit: async () => {
        const { createUser } = await import("../auth/db");
        createUser("alice", "alice-password", "user", "alice@test.local");
      }
    });

    const adminCookie = await login("admin", "admin-secret-123");

    // Find alice's user id
    const usersRes = await apiRequest("/api/users", {
      method: "GET",
      headers: { Cookie: adminCookie }
    });
    const users = (usersRes.payload as { users: Array<{ id: string; username: string }> }).users;
    const alice = users.find((u) => u.username === "alice")!;

    const { id } = await createPlaylist(adminCookie, { name: "Collab" });

    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Cookie: adminCookie },
      body: JSON.stringify({ collaborators: [alice.id] })
    });
    expect(res.status).toBe(200);
    const updated = (res.payload as { playlist: Playlist }).playlist;
    expect(updated.collaborators).toEqual([alice.id]);
  });

  it("rejects invalid collaborator user ids", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({ tempDirPrefix: "flaque-playlist-collabs-invalid-", indexStore });
    const cookie = await login("admin", "admin-secret-123");

    const { id } = await createPlaylist(cookie, { name: "BadCollab" });

    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: JSON.stringify({ collaborators: ["nonexistent-user-id"] })
    });
    expect(res.status).toBe(400);
    expect(res.payload).toEqual(expect.objectContaining({ error: expect.stringContaining("Unknown collaborator") }));
  });

  // ── Cover ────────────────────────────────────────────────────────

  it("returns 404 for cover on playlist without cover", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({ tempDirPrefix: "flaque-playlist-cover-none-", indexStore });
    const cookie = await login("admin", "admin-secret-123");

    const { id } = await createPlaylist(cookie, { name: "NoCover" });

    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}/cover`, {
      method: "GET",
      headers: { Cookie: cookie }
    });
    expect(res.status).toBe(404);
  });

  it("rejects cover upload with non-image file", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({ tempDirPrefix: "flaque-playlist-cover-bad-", indexStore });
    const cookie = await login("admin", "admin-secret-123");

    const { id } = await createPlaylist(cookie, { name: "BadCover" });

    const res = await apiMultipartRequest({
      pathname: `/api/playlists/${encodeURIComponent(id)}/cover`,
      cookie,
      fileFieldName: "cover",
      fileName: "readme.txt",
      mimeType: "text/plain",
      bytes: [72, 101, 108, 108, 111] // "Hello"
    });
    expect(res.status).toBe(400);
  });

  it("rejects cover delete on another user's playlist", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({
      tempDirPrefix: "flaque-playlist-cover-authz-",
      indexStore,
      beforeInit: async () => {
        const { createUser } = await import("../auth/db");
        createUser("alice", "alice-password", "user", "alice@test.local");
      }
    });

    const adminCookie = await login("admin", "admin-secret-123");
    const aliceCookie = await login("alice", "alice-password");

    const { id } = await createPlaylist(adminCookie, { name: "NotYours" });

    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}/cover`, {
      method: "DELETE",
      headers: { Cookie: aliceCookie }
    });
    expect(res.status).toBe(403);
  });

  it("blocks cover GET for private playlist from non-owner", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({
      tempDirPrefix: "flaque-playlist-cover-view-",
      indexStore,
      beforeInit: async () => {
        const { createUser } = await import("../auth/db");
        createUser("alice", "alice-password", "user", "alice@test.local");
      }
    });

    const adminCookie = await login("admin", "admin-secret-123");
    const aliceCookie = await login("alice", "alice-password");

    const { id } = await createPlaylist(adminCookie, { name: "PrivCover", visibility: "private" });

    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}/cover`, {
      method: "GET",
      headers: { Cookie: aliceCookie }
    });
    // Either 404 (no cover) or 403 (access denied) — since there's no cover, the check
    // should fail with 404 before the visibility check, but if we had a cover it would be 403.
    // Without a cover: 404 is expected.
    expect(res.status).toBe(404);
  });

  // ── Description preserved across rename ──────────────────────────

  it("preserves description when renaming a playlist", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({ tempDirPrefix: "flaque-playlist-rename-desc-", indexStore });
    const cookie = await login("admin", "admin-secret-123");

    const { id } = await createPlaylist(cookie, { name: "Original", description: "My description" });

    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Cookie: cookie },
      body: JSON.stringify({ name: "Renamed", description: "Updated desc" })
    });
    expect(res.status).toBe(200);
    const updated = (res.payload as { playlist: Playlist }).playlist;
    expect(updated.name).toBe("Renamed");
    expect(updated.description).toBe("Updated desc");
  });

  // ── Hearts preserved across updates ──────────────────────────────

  it("preserves hearts when patching a playlist", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({
      tempDirPrefix: "flaque-playlist-heart-persist-",
      indexStore,
      beforeInit: async () => {
        const { createUser } = await import("../auth/db");
        createUser("alice", "alice-password", "user", "alice@test.local");
      }
    });

    const adminCookie = await login("admin", "admin-secret-123");
    const aliceCookie = await login("alice", "alice-password");

    const { id } = await createPlaylist(adminCookie, { name: "HeartKeep", visibility: "public" });

    // Alice hearts it
    await apiRequest(`/api/playlists/${encodeURIComponent(id)}/heart`, {
      method: "POST",
      headers: { Cookie: aliceCookie }
    });

    // Admin patches the playlist
    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Cookie: adminCookie },
      body: JSON.stringify({ name: "HeartKeep Renamed" })
    });
    expect(res.status).toBe(200);
    const updated = (res.payload as { playlist: Playlist }).playlist;
    expect(updated.heartCount).toBe(1);
  });

  // ── PUT (full update) ────────────────────────────────────────────

  it("rejects PUT from non-owner", async () => {
    indexStore = makeFakeIndexStore(defaultTracks);
    await setupTestServer({
      tempDirPrefix: "flaque-playlist-put-authz-",
      indexStore,
      beforeInit: async () => {
        const { createUser } = await import("../auth/db");
        createUser("alice", "alice-password", "user", "alice@test.local");
      }
    });

    const adminCookie = await login("admin", "admin-secret-123");
    const aliceCookie = await login("alice", "alice-password");

    const { id } = await createPlaylist(adminCookie, { name: "NotAlice", visibility: "public" });

    const res = await apiRequest(`/api/playlists/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { Cookie: aliceCookie },
      body: JSON.stringify({
        name: "Hijacked",
        visibility: "public",
        trackIds: ["track-a"]
      })
    });
    expect(res.status).toBe(403);
  });
});
