import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { IndexStore } from "../services/indexer/indexStore";
import type { LibraryIndex, Track } from "../types/library";
import { resetRadioStateForTests } from "../services/radio/radioService";
import { apiRequest, login, setupTestServer, teardownTestServer } from "./testHelpers";

function createTrack(input: {
  id: string;
  artist: string;
  album: string;
  owner: string;
  duration?: number;
}): Track {
  return {
    id: input.id,
    owner: input.owner,
    path: `storage/users/${input.owner}/uploads/${input.id}.mp3`,
    duration: input.duration ?? 180,
    mimeType: "audio/mpeg",
    codec: "mp3",
    tags: {
      title: input.id,
      artist: input.artist,
      album: input.album
    }
  };
}

class FakeIndexStore {
  private readonly snapshot: LibraryIndex;

  constructor(tracks: Track[]) {
    this.snapshot = {
      generatedAt: new Date().toISOString(),
      totalTracks: tracks.length,
      tracks,
      playlists: []
    };
  }

  getSnapshot(): LibraryIndex {
    return this.snapshot;
  }
}

function createLibrary(size: number): Track[] {
  const tracks: Track[] = [];
  for (let index = 0; index < size; index += 1) {
    tracks.push(
      createTrack({
        id: `radio-${index + 1}`,
        artist: `Artist ${index % 6}`,
        album: `Album ${index % 8}`,
        owner: `owner-${(index % 3) + 1}`,
        duration: 120 + (index % 50)
      })
    );
  }
  return tracks;
}

describe("radioRoutes", () => {
  beforeEach(() => {
    resetRadioStateForTests();
  });

  afterEach(async () => {
    resetRadioStateForTests();
    await teardownTestServer();
  });

  it("creates, reads, queues and rebuilds a station", async () => {
    const indexStore = new FakeIndexStore(createLibrary(22)) as unknown as IndexStore;
    await setupTestServer({
      tempDirPrefix: "flaque-radio-routes-",
      indexStore
    });

    const adminCookie = await login("admin", "admin-secret-123");

    const createResponse = await apiRequest("/api/radio/create", {
      method: "POST",
      headers: { Cookie: adminCookie }
    });
    expect(createResponse.status).toBe(200);
    const createPayload = createResponse.payload as {
      success: boolean;
      station: { id: string } | null;
    };
    expect(createPayload.success).toBe(true);
    expect(createPayload.station?.id).toBeTruthy();

    const stateResponse = await apiRequest("/api/radio/state", {
      method: "GET",
      headers: { Cookie: adminCookie }
    });
    expect(stateResponse.status).toBe(200);
    expect(stateResponse.payload).toEqual(
      expect.objectContaining({
        status: "running",
        station: expect.objectContaining({
          id: createPayload.station?.id
        })
      })
    );

    const queueResponse = await apiRequest("/api/radio/queue", {
      method: "GET",
      headers: { Cookie: adminCookie }
    });
    expect(queueResponse.status).toBe(200);
    const queuePayload = queueResponse.payload as {
      station: { trackList: Array<{ trackId: string }> } | null;
    };
    expect(queuePayload.station).not.toBeNull();
    expect(queuePayload.station?.trackList.length).toBeLessThanOrEqual(10);

    const stationId = createPayload.station?.id;
    if (!stationId) {
      throw new Error("Expected station id after create");
    }

    const rebuildResponse = await apiRequest(`/api/radio/rebuild/${stationId}`, {
      method: "POST",
      headers: { Cookie: adminCookie }
    });
    expect(rebuildResponse.status).toBe(200);
    expect(rebuildResponse.payload).toEqual(
      expect.objectContaining({
        success: true,
        station: expect.objectContaining({
          id: expect.not.stringMatching(`^${stationId}$`)
        })
      })
    );
  });

  it("returns explicit error when rebuild station id mismatches", async () => {
    const indexStore = new FakeIndexStore(createLibrary(16)) as unknown as IndexStore;
    await setupTestServer({
      tempDirPrefix: "flaque-radio-routes-",
      indexStore
    });

    const adminCookie = await login("admin", "admin-secret-123");
    await apiRequest("/api/radio/create", {
      method: "POST",
      headers: { Cookie: adminCookie }
    });

    const rebuildResponse = await apiRequest("/api/radio/rebuild/wrong-station", {
      method: "POST",
      headers: { Cookie: adminCookie }
    });

    expect(rebuildResponse.status).toBe(200);
    expect(rebuildResponse.payload).toEqual(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining("stationId mismatch")
      })
    );
  });
});
