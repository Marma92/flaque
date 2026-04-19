import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import type { IndexStore, Track } from "../services/indexer/indexStore";
import { loadPlaylist, resolveTrackIds } from "./playlist";
import { AppError } from "../utils/AppError";
import type { Playlist, PlaylistVisibility } from "../types/library";
import { canViewPlaylist } from "../../services/playlists/playlistStore";

// Mock data
const mockTrackA: Track = {
  id: "track-a",
  owner: "user-1",
  path: "/storage/users/user-1/uploads/track-a.mp3",
  duration: 180,
  mimeType: "audio/mpeg",
  codec: "mp3",
  tags: {
    title: "Track A",
    artist: "Artist A",
    album: "Album A"
  }
};

const mockTrackB: Track = {
  id: "track-b",
  owner: "user-1",
  path: "/storage/users/user-1/uploads/track-b.mp3",
  duration: 240,
  mimeType: "audio/mpeg",
  codec: "mp3",
  tags: {
    title: "Track B",
    artist: "Artist B",
    album: "Album B"
  }
};

const mockPlaylist: Playlist = {
  id: "user-1:my-playlist",
  name: "My Playlist",
  authorId: "user-1",
  visibility: "public" as PlaylistVisibility,
  description: "Test playlist",
  trackIds: ["track-a", "track-b"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  hearts: [],
  listenCount: 0,
  collaborators: []
};

const mockIndexStore: IndexStore = {
  getSnapshot: vi.fn(),
  getTrackById: vi.fn(),
  getTracksByArtistId: vi.fn(),
  getTracksByAlbumId: vi.fn(),
  getTracksByGenre: vi.fn(),
  getTracksById: vi.fn(),
  refreshLibrary: vi.fn(),
  refreshPlaylists: vi.fn(),
  getArtistById: vi.fn(),
  getAlbumById: vi.fn(),
  getGenres: vi.fn(),
  getUserById: vi.fn(),
  getAuthState: vi.fn(),
  getAuthStatus: vi.fn()
};

describe("Playlist Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: vi.Mock<NextFunction>;

  beforeEach(() => {
    mockReq = {
      authUser: { id: "user-1", role: "user" },
      params: {},
      body: {}
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as Partial<Response>;
    mockNext = vi.fn();

    // Reset mocks
    vi.clearAllMocks();
  });

  describe("loadPlaylist", () => {
    it("should attach playlist to request when found and user can view", async () => {
      mockReq.params.id = "user-1:my-playlist";
      mockIndexStore.getSnapshot.mockReturnValue({ playlists: [mockPlaylist] });

      const middleware = loadPlaylist(mockIndexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as any).playlist).toEqual(mockPlaylist);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should call next with AppError when authentication required but not provided", async () => {
      mockReq.authUser = undefined;
      mockReq.params.id = "user-1:my-playlist";

      const middleware = loadPlaylist(mockIndexStore, true);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new AppError("Authentication required", 401));
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it("should call next with AppError when playlist not found", async () => {
      mockReq.params.id = "non-existent";
      mockIndexStore.getSnapshot.mockReturnValue({ playlists: [] });

      const middleware = loadPlaylist(mockIndexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new AppError("Playlist not found", 404));
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it("should call next with AppError when user cannot view playlist", async () => {
      mockReq.params.id = "user-1:my-playlist";
      mockIndexStore.getSnapshot.mockReturnValue({ playlists: [mockPlaylist] });
      
      // Import the function directly like in playlistStore.test.ts
      const playlistStore = await import("../services/playlists/playlistStore");
      vi.spyOn(playlistStore, "canViewPlaylist").mockImplementation(() => false);

      const middleware = loadPlaylist(mockIndexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new AppError("Not allowed to access this playlist", 403));
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it("should not require authentication when requireAuth=false", async () => {
      mockReq.authUser = undefined;
      mockReq.params.id = "user-1:my-playlist";
      mockIndexStore.getSnapshot.mockReturnValue({ playlists: [mockPlaylist] });

      const middleware = loadPlaylist(mockIndexStore, false);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as any).playlist).toEqual(mockPlaylist);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("resolveTrackIds", () => {
    it("should resolve track IDs to Track objects and attach to request", async () => {
      mockReq.body.trackIds = ["track-a", "track-b"];
      mockIndexStore.getTracksById.mockReturnValue(new Map([
        ["track-a", mockTrackA],
        ["track-b", mockTrackB]
      ]));

      const middleware = resolveTrackIds(mockIndexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as any).tracks).toEqual([mockTrackA, mockTrackB]);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it("should handle empty trackIds array", async () => {
      mockReq.body.trackIds = [];

      const middleware = resolveTrackIds(mockIndexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it("should handle missing trackIds in request", async () => {
      // No trackIds in body
      const middleware = resolveTrackIds(mockIndexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      // Should not attach anything and call next
      expect(mockNext).toHaveBeenCalled();
    });

    it("should call next with AppError when trackIds is not an array", async () => {
      mockReq.body.trackIds = "not-an-array" as any;

      const middleware = resolveTrackIds(mockIndexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new AppError("trackIds must be an array of track ids", 400));
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it("should call next with AppError when trackIds contains non-string values", async () => {
      mockReq.body.trackIds = ["valid", 123] as any;

      const middleware = resolveTrackIds(mockIndexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new AppError("trackIds must be an array of track ids", 400));
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it("should handle tracks that are not found in index", async () => {
      mockReq.body.trackIds = ["track-a", "non-existent"];
      mockIndexStore.getTracksById.mockReturnValue(new Map([
        ["track-a", mockTrackA]
        // track-b not found
      ]));

      const middleware = resolveTrackIds(mockIndexStore);
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as any).tracks).toEqual([mockTrackA]); // Only found track
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });
});