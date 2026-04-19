import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

import { loadPlaylist, resolveTrackIds } from "./playlist";
import { AppError } from "../utils/AppError";
import type { IndexStore } from "../services/indexer/indexStore";
import type { Playlist, Track } from "../types/library";
import type { AuthUser } from "../types/auth";

const mockTrackA: Track = {
  id: "track-a",
  owner: "user-1",
  path: "/storage/users/user-1/uploads/track-a.mp3",
  duration: 180,
  mimeType: "audio/mpeg",
  codec: "mp3",
  tags: { title: "Track A", artist: "Artist A", album: "Album A" }
};

const mockTrackB: Track = {
  id: "track-b",
  owner: "user-1",
  path: "/storage/users/user-1/uploads/track-b.mp3",
  duration: 240,
  mimeType: "audio/mpeg",
  codec: "mp3",
  tags: { title: "Track B", artist: "Artist B", album: "Album B" }
};

const mockPlaylist: Playlist = {
  id: "user-1:my-playlist",
  name: "My Playlist",
  authorId: "user-1",
  visibility: "public",
  description: "Test playlist",
  trackIds: ["track-a", "track-b"],
  cover: null,
  hearts: [],
  heartCount: 0,
  listenCount: 0,
  collaborators: []
};

const mockUser: AuthUser = {
  id: "user-1",
  username: "user-1",
  email: "user1@example.com",
  role: "user"
};

function createMockIndexStore(overrides: Partial<{
  playlists: Playlist[];
  tracksById: Map<string, Track>;
}> = {}): IndexStore {
  const playlists = overrides.playlists ?? [];
  const tracksById = overrides.tracksById ?? new Map();
  return {
    getSnapshot: vi.fn(() => ({
      tracks: [],
      artists: [],
      albums: [],
      playlists
    })),
    getTracksById: vi.fn((ids: string[]) => {
      const map = new Map<string, Track>();
      for (const id of ids) {
        const track = tracksById.get(id);
        if (track) map.set(id, track);
      }
      return map;
    })
  } as unknown as IndexStore;
}

describe("Playlist Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReq = {
      authUser: mockUser,
      params: {},
      body: {}
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    mockNext = vi.fn();
  });

  describe("loadPlaylist", () => {
    it("attaches playlist to request when found and user can view", async () => {
      mockReq.params!.id = "user-1:my-playlist";
      const indexStore = createMockIndexStore({ playlists: [mockPlaylist] });

      const middleware = loadPlaylist(indexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect((mockReq as any).playlist).toEqual(mockPlaylist);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("calls next with 401 when authentication required but not provided", async () => {
      mockReq.authUser = undefined;
      mockReq.params!.id = "user-1:my-playlist";
      const indexStore = createMockIndexStore();

      const middleware = loadPlaylist(indexStore, true);
      await middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      const err = mockNext.mock.calls[0]?.[0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(401);
    });

    it("calls next with 404 when playlist not found", async () => {
      mockReq.params!.id = "non-existent";
      const indexStore = createMockIndexStore({ playlists: [] });

      const middleware = loadPlaylist(indexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      const err = mockNext.mock.calls[0]?.[0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(404);
    });

    it("calls next with 403 when user cannot view a private playlist owned by someone else", async () => {
      const privatePlaylist: Playlist = {
        ...mockPlaylist,
        id: "other-user:secret",
        authorId: "other-user",
        visibility: "private"
      };
      mockReq.params!.id = privatePlaylist.id;
      const indexStore = createMockIndexStore({ playlists: [privatePlaylist] });

      const middleware = loadPlaylist(indexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      const err = mockNext.mock.calls[0]?.[0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
    });

    it("allows public access when requireAuth=false", async () => {
      mockReq.authUser = undefined;
      mockReq.params!.id = mockPlaylist.id;
      const indexStore = createMockIndexStore({ playlists: [mockPlaylist] });

      const middleware = loadPlaylist(indexStore, false);
      await middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect((mockReq as any).playlist).toEqual(mockPlaylist);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe("resolveTrackIds", () => {
    it("resolves track IDs to Track objects and attaches to request", async () => {
      mockReq.body.trackIds = ["track-a", "track-b"];
      const indexStore = createMockIndexStore({
        tracksById: new Map([
          ["track-a", mockTrackA],
          ["track-b", mockTrackB]
        ])
      });

      const middleware = resolveTrackIds(indexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect((mockReq as any).tracks).toEqual([mockTrackA, mockTrackB]);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it("handles empty trackIds array", async () => {
      mockReq.body.trackIds = [];
      const indexStore = createMockIndexStore();

      const middleware = resolveTrackIds(indexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it("passes through when trackIds missing from body", async () => {
      const indexStore = createMockIndexStore();

      const middleware = resolveTrackIds(indexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it("calls next with AppError when trackIds is not an array", async () => {
      mockReq.body.trackIds = "not-an-array";
      const indexStore = createMockIndexStore();

      const middleware = resolveTrackIds(indexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      const err = mockNext.mock.calls[0]?.[0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(400);
    });

    it("calls next with AppError when trackIds contains non-string values", async () => {
      mockReq.body.trackIds = ["valid", 123];
      const indexStore = createMockIndexStore();

      const middleware = resolveTrackIds(indexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      const err = mockNext.mock.calls[0]?.[0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(400);
    });

    it("filters out track IDs not present in the index", async () => {
      mockReq.body.trackIds = ["track-a", "non-existent"];
      const indexStore = createMockIndexStore({
        tracksById: new Map([["track-a", mockTrackA]])
      });

      const middleware = resolveTrackIds(indexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect((mockReq as any).tracks).toEqual([mockTrackA]);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });
});
