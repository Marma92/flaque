import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryIndex, Track } from "../types/library";
import { apiRequest, login, setupTestServer, teardownTestServer } from "./testHelpers";

class FakeIndexStore {
  private snapshot: LibraryIndex;

  constructor(snapshot: LibraryIndex) {
    this.snapshot = snapshot;
  }

  getSnapshot(): LibraryIndex { return this.snapshot; }
  getTracks(): Track[] { return this.snapshot.tracks; }
  getTrackById(trackId: string): Track | undefined {
    return this.snapshot.tracks.find((t) => t.id === trackId);
  }
  hasTrack(trackId: string): boolean { return this.getTrackById(trackId) !== undefined; }
  getTracksByOwner(): Track[] { return []; }
  getTracksByArtist(): Track[] { return []; }
  getTracksByAlbum(): Track[] { return []; }
  async rebuild(): Promise<LibraryIndex> { return this.snapshot; }
}

function makeTrack(id: string, overrides: Partial<Track["tags"]> = {}): Track {
  return {
    id,
    owner: "owner-1",
    path: `storage/users/owner-1/uploads/${id}.flac`,
    duration: 120,
    mimeType: "audio/flac",
    codec: "flac",
    tags: { title: `Title ${id}`, artist: "Artist", album: "Album", ...overrides },
    cover: `/api/covers/${id}`
  };
}

async function setupAdmin(): Promise<string> {
  const snapshot: LibraryIndex = {
    generatedAt: new Date().toISOString(),
    totalTracks: 1,
    tracks: [makeTrack("track-1", { genre: ["Rock"] })]
  };
  await setupTestServer({
    tempDirPrefix: "flaque-genre-routes-",
    indexStore: new FakeIndexStore(snapshot)
  });
  return login("admin", "admin-secret-123");
}

beforeEach(() => {
  // Block any real network calls these routes might make.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await teardownTestServer();
});

describe("genreRoutes auth", () => {
  it("rejects unauthenticated requests", async () => {
    await setupAdmin();
    const res = await apiRequest("/api/genre/synonyms");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users", async () => {
    const cookie = await setupAdmin();
    // Create a regular user via admin and try with their cookie.
    const created = await apiRequest("/api/users", {
      method: "POST",
      headers: { Cookie: cookie },
      body: JSON.stringify({
        username: "regular",
        email: "regular@test.local",
        password: "regular-secret-123",
        role: "user"
      })
    });
    expect(created.status).toBe(201);
    const userCookie = await login("regular", "regular-secret-123");
    const res = await apiRequest("/api/genre/synonyms", { headers: { Cookie: userCookie } });
    expect(res.status).toBe(403);
  });
});

describe("genreRoutes synonyms", () => {
  it("GET /synonyms returns the default table", async () => {
    const cookie = await setupAdmin();
    const res = await apiRequest("/api/genre/synonyms", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const payload = res.payload as Record<string, string>;
    // The default table ships with a handful of well-known mappings.
    expect(payload["hiphop"]).toBe("Hip-Hop");
  });

  it("PUT /synonyms adds a new mapping", async () => {
    const cookie = await setupAdmin();
    const res = await apiRequest("/api/genre/synonyms", {
      method: "PUT",
      headers: { Cookie: cookie },
      body: JSON.stringify({ from: "Foobar", to: "Foo Bar" })
    });
    expect(res.status).toBe(200);
    expect(res.payload).toEqual({ from: "foobar", to: "Foo Bar" });

    const list = await apiRequest("/api/genre/synonyms", { headers: { Cookie: cookie } });
    expect((list.payload as Record<string, string>)["foobar"]).toBe("Foo Bar");
  });

  it("PUT /synonyms rejects missing fields", async () => {
    const cookie = await setupAdmin();
    const res = await apiRequest("/api/genre/synonyms", {
      method: "PUT",
      headers: { Cookie: cookie },
      body: JSON.stringify({ from: "x" })
    });
    expect(res.status).toBe(400);
  });

  it("DELETE /synonyms/:key removes a mapping", async () => {
    const cookie = await setupAdmin();
    await apiRequest("/api/genre/synonyms", {
      method: "PUT",
      headers: { Cookie: cookie },
      body: JSON.stringify({ from: "deleteme", to: "Whatever" })
    });
    const res = await apiRequest("/api/genre/synonyms/deleteme", {
      method: "DELETE",
      headers: { Cookie: cookie }
    });
    expect(res.status).toBe(200);
    expect(res.payload).toEqual({ removed: true });
  });

  it("DELETE /synonyms/:key returns 404 for unknown key", async () => {
    const cookie = await setupAdmin();
    const res = await apiRequest("/api/genre/synonyms/nope-not-here", {
      method: "DELETE",
      headers: { Cookie: cookie }
    });
    expect(res.status).toBe(404);
  });

  it("POST /synonyms/reset reverts to defaults", async () => {
    const cookie = await setupAdmin();
    await apiRequest("/api/genre/synonyms/hiphop", {
      method: "DELETE",
      headers: { Cookie: cookie }
    });
    const res = await apiRequest("/api/genre/synonyms/reset", {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(res.status).toBe(200);
    const list = await apiRequest("/api/genre/synonyms", { headers: { Cookie: cookie } });
    expect((list.payload as Record<string, string>)["hiphop"]).toBe("Hip-Hop");
  });
});

describe("genreRoutes library labels", () => {
  it("returns labels with counts sorted by frequency", async () => {
    const cookie = await setupAdmin();
    const res = await apiRequest("/api/genre/library-labels", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const { labels } = res.payload as { labels: Array<{ label: string; count: number }> };
    // Our fake snapshot has one track with genre ["Rock"]
    expect(labels[0]).toEqual({ label: "Rock", count: 1 });
  });
});

describe("genreRoutes enrichment status & log", () => {
  it("GET /enrichment/status returns running:false initially", async () => {
    const cookie = await setupAdmin();
    const res = await apiRequest("/api/genre/enrichment/status", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(res.payload).toEqual(
      expect.objectContaining({ running: false, processed: 0 })
    );
  });

  it("GET /enrichment/log returns an empty list when nothing has been logged", async () => {
    const cookie = await setupAdmin();
    const res = await apiRequest("/api/genre/enrichment/log", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(res.payload).toEqual({ entries: [] });
  });

  it("DELETE /enrichment/log returns cleared:true", async () => {
    const cookie = await setupAdmin();
    const res = await apiRequest("/api/genre/enrichment/log", {
      method: "DELETE",
      headers: { Cookie: cookie }
    });
    expect(res.status).toBe(200);
    expect(res.payload).toEqual({ cleared: true });
  });
});

describe("genreRoutes re-enrich track", () => {
  it("returns 404 when track does not exist", async () => {
    const cookie = await setupAdmin();
    const res = await apiRequest("/api/genre/enrichment/track/does-not-exist", {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when the track has no artist/title", async () => {
    // Setup with a track missing artist/title.
    const snapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 1,
      tracks: [{
        id: "broken-1",
        owner: "owner-1",
        path: "storage/users/owner-1/uploads/broken.flac",
        duration: 120,
        mimeType: "audio/flac",
        codec: "flac",
        tags: {},
        cover: "/api/covers/broken-1"
      }]
    };
    await setupTestServer({
      tempDirPrefix: "flaque-genre-routes-",
      indexStore: new FakeIndexStore(snapshot)
    });
    const cookie = await login("admin", "admin-secret-123");

    const res = await apiRequest("/api/genre/enrichment/track/broken-1", {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(res.status).toBe(400);
  });
});

describe("genreRoutes cache stats", () => {
  it("returns shape with feature-flag booleans", async () => {
    const cookie = await setupAdmin();
    const res = await apiRequest("/api/genre/cache/stats", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    expect(res.payload).toEqual(
      expect.objectContaining({
        entries: expect.any(Number),
        acoustIdConfigured: expect.any(Boolean),
        fingerprintingAvailable: expect.any(Boolean)
      })
    );
  });

  it("POST /cache/clear returns cleared:true", async () => {
    const cookie = await setupAdmin();
    const res = await apiRequest("/api/genre/cache/clear", {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(res.status).toBe(200);
    expect(res.payload).toEqual({ cleared: true });
  });
});

describe("genreRoutes reapply synonyms", () => {
  it("returns scanned/updated counts", async () => {
    const cookie = await setupAdmin();
    const res = await apiRequest("/api/genre/synonyms/reapply", {
      method: "POST",
      headers: { Cookie: cookie }
    });
    expect(res.status).toBe(200);
    expect(res.payload).toEqual(
      expect.objectContaining({
        scanned: expect.any(Number),
        updated: expect.any(Number)
      })
    );
  });
});
