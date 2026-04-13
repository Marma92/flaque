import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LibraryIndex, Track } from "../types/library";
import { apiRequest, getDataRoot, login, setupTestServer, teardownTestServer } from "./testHelpers";

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

let indexStore: FakeIndexStore;

beforeEach(async () => {
  indexStore = new FakeIndexStore({
    generatedAt: new Date().toISOString(),
    totalTracks: 0,
    tracks: [],
    playlists: []
  });
});

afterEach(async () => {
  await teardownTestServer();
});

describe("playlistRoutes", () => {
  it("supports playlist CRUD with file-based storage", async () => {
    indexStore = new FakeIndexStore({
      generatedAt: new Date().toISOString(),
      totalTracks: 2,
      tracks: [
        createTrack("track-a", "storage/users/owner-1/uploads/a.mp3"),
        createTrack("track-b", "storage/users/owner-1/uploads/b.mp3")
      ],
      playlists: []
    });

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
    indexStore = new FakeIndexStore({
      generatedAt: new Date().toISOString(),
      totalTracks: 1,
      tracks: [createTrack("track-a", "storage/users/owner-1/uploads/a.mp3")],
      playlists: []
    });

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
});
