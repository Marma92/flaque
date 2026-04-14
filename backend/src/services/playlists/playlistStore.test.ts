import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

vi.mock("../../utils/paths", async () => {
  return {
    get dataRoot() { return path.join(tmpDir, "data"); },
    get storageRoot() { return path.join(tmpDir, "data", "storage"); },
    get usersStorageRoot() { return path.join(tmpDir, "data", "storage", "users"); },
    get configRoot() { return path.join(tmpDir, "data", "config"); },
    get indexRoot() { return path.join(tmpDir, "data", "index"); },
    get cacheRoot() { return path.join(tmpDir, "data", "cache"); },
    get logsRoot() { return path.join(tmpDir, "data", "logs"); },
    get backupsRoot() { return path.join(tmpDir, "data", "backups"); },
    get indexFilePath() { return path.join(tmpDir, "data", "index", "library-index.json"); },
    get metadataOverridesFilePath() { return path.join(tmpDir, "data", "index", "track-metadata-overrides.json"); },
    get trackActivityLogFilePath() { return path.join(tmpDir, "data", "index", "track-activity-log.json"); }
  };
});

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

import type { Playlist, Track } from "../../types/library";
import type { AuthUser } from "../../types/auth";

function makeTrack(id: string): Track {
  return {
    id,
    owner: "user-1",
    path: `storage/users/user-1/uploads/${id}.mp3`,
    duration: 200,
    mimeType: "audio/mpeg",
    codec: "mp3",
    tags: { title: id, artist: "Artist" }
  };
}

function makeUser(id: string, role: "admin" | "user" = "user"): AuthUser {
  return { id, username: id, role, email: `${id}@test.local` };
}

function makePlaylist(overrides: Partial<Playlist> & { id: string; authorId: string }): Playlist {
  return {
    name: "Test",
    visibility: "public",
    trackIds: [],
    description: "",
    cover: null,
    hearts: [],
    heartCount: 0,
    listenCount: 0,
    collaborators: [],
    ...overrides
  };
}

describe("playlistStore", () => {
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "plstore-test-"));
    await fs.mkdir(path.join(tmpDir, "data", "storage", "users"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── canViewPlaylist ────────────────────────────────────────────

  describe("canViewPlaylist", () => {
    it("allows owner to view private playlist", async () => {
      const { canViewPlaylist } = await import("./playlistStore");
      const playlist = makePlaylist({ id: "u1:test", authorId: "u1", visibility: "private" });
      expect(canViewPlaylist(playlist, makeUser("u1"))).toBe(true);
    });

    it("blocks non-owner from private playlist", async () => {
      const { canViewPlaylist } = await import("./playlistStore");
      const playlist = makePlaylist({ id: "u1:test", authorId: "u1", visibility: "private" });
      expect(canViewPlaylist(playlist, makeUser("u2"))).toBe(false);
    });

    it("allows anyone to view public playlist", async () => {
      const { canViewPlaylist } = await import("./playlistStore");
      const playlist = makePlaylist({ id: "u1:test", authorId: "u1", visibility: "public" });
      expect(canViewPlaylist(playlist, makeUser("u2"))).toBe(true);
    });

    it("allows admin to view private playlist", async () => {
      const { canViewPlaylist } = await import("./playlistStore");
      const playlist = makePlaylist({ id: "u1:test", authorId: "u1", visibility: "private" });
      expect(canViewPlaylist(playlist, makeUser("admin-user", "admin"))).toBe(true);
    });
  });

  // ── canManagePlaylist ──────────────────────────────────────────

  describe("canManagePlaylist", () => {
    it("allows owner to manage", async () => {
      const { canManagePlaylist } = await import("./playlistStore");
      const playlist = makePlaylist({ id: "u1:test", authorId: "u1" });
      expect(canManagePlaylist(playlist, makeUser("u1"))).toBe(true);
    });

    it("allows admin to manage", async () => {
      const { canManagePlaylist } = await import("./playlistStore");
      const playlist = makePlaylist({ id: "u1:test", authorId: "u1" });
      expect(canManagePlaylist(playlist, makeUser("admin-user", "admin"))).toBe(true);
    });

    it("blocks non-owner non-admin from managing", async () => {
      const { canManagePlaylist } = await import("./playlistStore");
      const playlist = makePlaylist({ id: "u1:test", authorId: "u1" });
      expect(canManagePlaylist(playlist, makeUser("u2"))).toBe(false);
    });
  });

  // ── filterPlayablePlaylists ────────────────────────────────────

  describe("filterPlayablePlaylists", () => {
    it("filters private playlists for non-owner", async () => {
      const { filterPlayablePlaylists } = await import("./playlistStore");
      const playlists = [
        makePlaylist({ id: "u1:pub", authorId: "u1", visibility: "public" }),
        makePlaylist({ id: "u1:priv", authorId: "u1", visibility: "private" }),
        makePlaylist({ id: "u2:mine", authorId: "u2", visibility: "private" })
      ];
      const result = filterPlayablePlaylists(playlists, makeUser("u2"));
      expect(result.map((p) => p.id)).toEqual(["u1:pub", "u2:mine"]);
    });
  });

  // ── togglePlaylistHeart ────────────────────────────────────────

  describe("togglePlaylistHeart", () => {
    it("hearts and un-hearts a playlist", async () => {
      const { createFilesystemPlaylist, togglePlaylistHeart, scanFilesystemPlaylists } = await import("./playlistStore");
      const tracks = [makeTrack("t1")];
      const tracksById = new Map(tracks.map((t) => [t.id, t]));

      const playlistId = await createFilesystemPlaylist({
        name: "Heart Test",
        authorId: "user-1",
        visibility: "public",
        trackIds: ["t1"],
        tracksById
      });

      // Heart
      const r1 = await togglePlaylistHeart(playlistId, "user-2");
      expect(r1.hearted).toBe(true);
      expect(r1.heartCount).toBe(1);

      // Verify persisted
      const scanned = await scanFilesystemPlaylists(tracks);
      const found = scanned.find((p) => p.id === playlistId)!;
      expect(found.hearts).toEqual(["user-2"]);
      expect(found.heartCount).toBe(1);

      // Un-heart
      const r2 = await togglePlaylistHeart(playlistId, "user-2");
      expect(r2.hearted).toBe(false);
      expect(r2.heartCount).toBe(0);
    });

    it("supports multiple users hearting", async () => {
      const { createFilesystemPlaylist, togglePlaylistHeart } = await import("./playlistStore");
      const tracks = [makeTrack("t1")];
      const tracksById = new Map(tracks.map((t) => [t.id, t]));

      const playlistId = await createFilesystemPlaylist({
        name: "Multi Heart",
        authorId: "user-1",
        visibility: "public",
        trackIds: ["t1"],
        tracksById
      });

      await togglePlaylistHeart(playlistId, "user-2");
      const r = await togglePlaylistHeart(playlistId, "user-3");
      expect(r.heartCount).toBe(2);
    });
  });

  // ── incrementPlaylistListenCount ───────────────────────────────

  describe("incrementPlaylistListenCount", () => {
    it("increments listen count", async () => {
      const { createFilesystemPlaylist, incrementPlaylistListenCount, scanFilesystemPlaylists } = await import("./playlistStore");
      const tracks = [makeTrack("t1")];
      const tracksById = new Map(tracks.map((t) => [t.id, t]));

      const playlistId = await createFilesystemPlaylist({
        name: "Listen Test",
        authorId: "user-1",
        visibility: "public",
        trackIds: ["t1"],
        tracksById
      });

      const count1 = await incrementPlaylistListenCount(playlistId);
      expect(count1).toBe(1);

      const count2 = await incrementPlaylistListenCount(playlistId);
      expect(count2).toBe(2);

      // Verify persisted
      const scanned = await scanFilesystemPlaylists(tracks);
      const found = scanned.find((p) => p.id === playlistId)!;
      expect(found.listenCount).toBe(2);
    });
  });

  // ── updatePlaylistCover ────────────────────────────────────────

  describe("updatePlaylistCover", () => {
    it("sets and clears cover path", async () => {
      const { createFilesystemPlaylist, updatePlaylistCover, scanFilesystemPlaylists } = await import("./playlistStore");
      const tracks = [makeTrack("t1")];
      const tracksById = new Map(tracks.map((t) => [t.id, t]));

      const playlistId = await createFilesystemPlaylist({
        name: "Cover Test",
        authorId: "user-1",
        visibility: "public",
        trackIds: ["t1"],
        tracksById
      });

      await updatePlaylistCover(playlistId, "/path/to/cover.webp");
      let scanned = await scanFilesystemPlaylists(tracks);
      let found = scanned.find((p) => p.id === playlistId)!;
      expect(found.cover).toBe("/path/to/cover.webp");

      await updatePlaylistCover(playlistId, null);
      scanned = await scanFilesystemPlaylists(tracks);
      found = scanned.find((p) => p.id === playlistId)!;
      expect(found.cover).toBeNull();
    });
  });

  // ── Create and update with new fields ──────────────────────────

  describe("createFilesystemPlaylist", () => {
    it("persists description", async () => {
      const { createFilesystemPlaylist, scanFilesystemPlaylists } = await import("./playlistStore");
      const tracks = [makeTrack("t1")];
      const tracksById = new Map(tracks.map((t) => [t.id, t]));

      const playlistId = await createFilesystemPlaylist({
        name: "Described",
        authorId: "user-1",
        visibility: "public",
        trackIds: ["t1"],
        tracksById,
        description: "My custom description"
      });

      const scanned = await scanFilesystemPlaylists(tracks);
      const found = scanned.find((p) => p.id === playlistId)!;
      expect(found.description).toBe("My custom description");
      expect(found.hearts).toEqual([]);
      expect(found.heartCount).toBe(0);
      expect(found.listenCount).toBe(0);
      expect(found.collaborators).toEqual([]);
      expect(found.cover).toBeNull();
    });
  });

  describe("updateFilesystemPlaylist", () => {
    it("updates description and collaborators", async () => {
      const { createFilesystemPlaylist, updateFilesystemPlaylist, scanFilesystemPlaylists } = await import("./playlistStore");
      const tracks = [makeTrack("t1")];
      const tracksById = new Map(tracks.map((t) => [t.id, t]));

      const playlistId = await createFilesystemPlaylist({
        name: "Updatable",
        authorId: "user-1",
        visibility: "public",
        trackIds: ["t1"],
        tracksById
      });

      await updateFilesystemPlaylist({
        id: playlistId,
        name: "Updatable",
        authorId: "user-1",
        visibility: "public",
        trackIds: ["t1"],
        tracksById,
        description: "New description",
        collaborators: ["user-2", "user-3"]
      });

      const scanned = await scanFilesystemPlaylists(tracks);
      const found = scanned.find((p) => p.id === playlistId)!;
      expect(found.description).toBe("New description");
      expect(found.collaborators).toEqual(["user-2", "user-3"]);
    });

    it("preserves hearts and listen count on update", async () => {
      const { createFilesystemPlaylist, togglePlaylistHeart, incrementPlaylistListenCount, updateFilesystemPlaylist, scanFilesystemPlaylists } = await import("./playlistStore");
      const tracks = [makeTrack("t1")];
      const tracksById = new Map(tracks.map((t) => [t.id, t]));

      const playlistId = await createFilesystemPlaylist({
        name: "Persistent",
        authorId: "user-1",
        visibility: "public",
        trackIds: ["t1"],
        tracksById
      });

      await togglePlaylistHeart(playlistId, "user-2");
      await incrementPlaylistListenCount(playlistId);
      await incrementPlaylistListenCount(playlistId);

      // Update name — hearts and listen count should survive
      await updateFilesystemPlaylist({
        id: playlistId,
        name: "Persistent Renamed",
        authorId: "user-1",
        visibility: "public",
        trackIds: ["t1"],
        tracksById
      });

      const scanned = await scanFilesystemPlaylists(tracks);
      const found = scanned.find((p) => p.name === "Persistent Renamed")!;
      expect(found).toBeDefined();
      expect(found.hearts).toEqual(["user-2"]);
      expect(found.heartCount).toBe(1);
      expect(found.listenCount).toBe(2);
    });
  });
});
