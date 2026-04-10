import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IndexStore } from "../indexer/indexStore";
import type { LibraryIndex, Track } from "../../types/library";
import { RADIO_MAX_TRACKS, RadioService, resetRadioStateForTests } from "./radioService";

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

function createStore(tracks: Track[]): IndexStore {
  const snapshot: LibraryIndex = {
    generatedAt: new Date().toISOString(),
    totalTracks: tracks.length,
    tracks,
    playlists: []
  };

  return {
    getSnapshot: () => snapshot
  } as IndexStore;
}

function createLargeLibrary(): Track[] {
  const tracks: Track[] = [];
  const artists = ["Artist A", "Artist B", "Artist C", "Artist D", "Artist E", "Artist F"];
  const albums = ["Album 1", "Album 2", "Album 3", "Album 4", "Album 5", "Album 6"];
  const owners = ["owner-1", "owner-2", "owner-3"];

  for (let index = 0; index < 24; index += 1) {
    tracks.push(
      createTrack({
        id: `track-${index + 1}`,
        artist: artists[index % artists.length]!,
        album: albums[(index * 2) % albums.length]!,
        owner: owners[index % owners.length]!,
        duration: 160 + (index % 40)
      })
    );
  }

  return tracks;
}

describe("RadioService", () => {
  beforeEach(() => {
    resetRadioStateForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetRadioStateForTests();
  });

  it("creates a running station with computed timeline", async () => {
    const service = new RadioService(createStore(createLargeLibrary()));

    const createResult = await service.createStation();
    const queueResult = await service.getQueue();

    expect(createResult.success).toBe(true);
    expect(createResult.station?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(queueResult.station).not.toBeNull();
    expect(queueResult.station?.trackList.length).toBeLessThanOrEqual(RADIO_MAX_TRACKS);
    expect(queueResult.station?.trackList.length).toBeGreaterThan(0);

    const trackList = queueResult.station?.trackList ?? [];
    for (let index = 1; index < trackList.length; index += 1) {
      expect(trackList[index]?.startsAt).toBe(trackList[index - 1]?.endsAt);
    }
  });

  it("rejects rebuild when station id does not match", async () => {
    const service = new RadioService(createStore(createLargeLibrary()));

    await service.createStation();
    const result = await service.rebuildStation("not-the-right-id");

    expect(result.success).toBe(false);
    expect(result.message).toContain("stationId mismatch");
    expect(result.station).not.toBeNull();
  });

  it("rebuilds with a new id and avoids overlap when possible", async () => {
    const service = new RadioService(createStore(createLargeLibrary()));

    const createResult = await service.createStation();
    const oldStationId = createResult.station?.id;
    if (!oldStationId) {
      throw new Error("Expected station id after create");
    }

    const oldQueue = await service.getQueue();
    const oldTrackIds = new Set((oldQueue.station?.trackList ?? []).map((track) => track.trackId));

    const rebuildResult = await service.rebuildStation(oldStationId);
    const newStationId = rebuildResult.station?.id;
    expect(rebuildResult.success).toBe(true);
    expect(newStationId).toBeTruthy();
    expect(newStationId).not.toBe(oldStationId);

    const newQueue = await service.getQueue();
    const newTrackIds = new Set((newQueue.station?.trackList ?? []).map((track) => track.trackId));
    const overlaps = Array.from(newTrackIds).filter((trackId) => oldTrackIds.has(trackId));
    expect(overlaps).toHaveLength(0);
  });

  it("invalidates expired stations on state reads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));

    const service = new RadioService(
      createStore([
        createTrack({ id: "short-a", artist: "A", album: "One", owner: "owner-1", duration: 65 }),
        createTrack({ id: "short-b", artist: "B", album: "Two", owner: "owner-2", duration: 70 })
      ])
    );

    const createResult = await service.createStation();
    expect(createResult.success).toBe(true);

    vi.setSystemTime(new Date("2026-02-01T10:03:00.000Z"));

    const stateResult = await service.getState();
    const queueResult = await service.getQueue();

    expect(stateResult.status).toBe("stopped");
    expect(stateResult.station).toBeNull();
    expect(queueResult.station).toBeNull();
  });
});
