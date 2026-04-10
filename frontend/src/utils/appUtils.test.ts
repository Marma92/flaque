/* @vitest-environment happy-dom */

import { describe, expect, it } from "vitest";

import type { Track } from "../types";
import {
  buildPathForRoute,
  getAdjacentTrackInQueue,
  getAlbumKey,
  getRouteFromLocation,
  isTrackLike,
  parseStoredQueueSnapshot,
  sortAlbumTracksByNumber
} from "./appUtils";

function createTrack(input: {
  id: string;
  title: string;
  trackNumber?: number;
  discNumber?: number;
}): Track {
  return {
    id: input.id,
    owner: "alice",
    path: `storage/users/alice/uploads/${input.id}.flac`,
    duration: 120,
    mimeType: "audio/flac",
    codec: "flac",
    tags: {
      title: input.title,
      trackNumber: input.trackNumber,
      discNumber: input.discNumber
    }
  };
}

describe("appUtils", () => {
  it("validates track-like payloads", () => {
    const validTrack = createTrack({ id: "t1", title: "Track" });
    expect(isTrackLike(validTrack)).toBe(true);
    expect(isTrackLike({ id: "t1" })).toBe(false);
    expect(isTrackLike(null)).toBe(false);
  });

  it("parses stored queue snapshots with normalization", () => {
    const parsed = parseStoredQueueSnapshot({
      userId: "  user-1  ",
      trackIds: [" track-a ", "track-a", "track-b", 3],
      currentTrackId: " track-b "
    });

    expect(parsed).toEqual({
      userId: "user-1",
      trackIds: ["track-a", "track-b"],
      currentTrackId: "track-b"
    });

    expect(parseStoredQueueSnapshot({ userId: "user-1", trackIds: "not-array" })).toBeNull();
  });

  it("returns adjacent tracks with and without wrapping", () => {
    const queue = [
      createTrack({ id: "a", title: "A" }),
      createTrack({ id: "b", title: "B" }),
      createTrack({ id: "c", title: "C" })
    ];

    expect(getAdjacentTrackInQueue(queue, "a", "next")?.id).toBe("b");
    expect(getAdjacentTrackInQueue(queue, "a", "previous", false)).toBeNull();
    expect(getAdjacentTrackInQueue(queue, "a", "previous", true)?.id).toBe("c");
  });

  it("builds path for route from view and section", () => {
    expect(buildPathForRoute("library", "home")).toBe("/");
    expect(buildPathForRoute("library", "music")).toBe("/library/music");
    expect(buildPathForRoute("library", "artists")).toBe("/library/artists");
    expect(buildPathForRoute("library")).toBe("/");
    expect(buildPathForRoute("config", "index")).toBe("/settings");
    expect(buildPathForRoute("config", "server")).toBe("/settings/server");
    expect(buildPathForRoute("config")).toBe("/settings");
    expect(buildPathForRoute("upload")).toBe("/upload");
    expect(buildPathForRoute("player")).toBe("/player");
    expect(buildPathForRoute("account")).toBe("/account");
  });

  it("reads route from location pathname", () => {
    window.history.replaceState({}, "", "/settings/server");
    expect(getRouteFromLocation()).toEqual({ view: "config", section: "server" });

    window.history.replaceState({}, "", "/library/artists");
    expect(getRouteFromLocation()).toEqual({ view: "library", section: "artists" });

    window.history.replaceState({}, "", "/upload");
    expect(getRouteFromLocation()).toEqual({ view: "upload", section: null });

    window.history.replaceState({}, "", "/");
    expect(getRouteFromLocation()).toEqual({ view: "library", section: "home" });

    window.history.replaceState({}, "", "/unknown-path");
    expect(getRouteFromLocation()).toEqual({ view: "library", section: "home" });
  });

  it("redirects legacy view query param to path", () => {
    window.history.replaceState({}, "", "/?view=config");
    const route = getRouteFromLocation();
    expect(route).toEqual({ view: "config", section: "index" });
    expect(window.location.pathname).toBe("/settings");
    expect(window.location.search).toBe("");
  });

  it("builds album keys with id fallback", () => {
    expect(getAlbumKey({ id: "album-1", name: "Name", artist: "Artist" })).toBe("id:album-1");
    expect(getAlbumKey({ name: "Name", artist: "Artist" })).toBe("artist::name");
  });

  it("sorts tracks by disc and track number", () => {
    const sorted = sortAlbumTracksByNumber([
      createTrack({ id: "b", title: "Second", trackNumber: 2, discNumber: 1 }),
      createTrack({ id: "a", title: "First", trackNumber: 1, discNumber: 1 }),
      createTrack({ id: "d2", title: "Disc2", trackNumber: 1, discNumber: 2 })
    ]);

    expect(sorted.map((track) => track.id)).toEqual(["a", "b", "d2"]);
  });
});
