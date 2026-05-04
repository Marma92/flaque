import { describe, expect, it } from "vitest";

import type { Track } from "../types";
import {
  formatArtistList,
  getTrackArtistList,
  getTrackDisplayArtist,
  getTrackPrimaryArtist
} from "./tracks";

function makeTrack(tags: Partial<Track["tags"]>): Track {
  return {
    id: "track-1",
    owner: "owner",
    path: "track.flac",
    duration: 0,
    mimeType: "audio/flac",
    codec: "flac",
    tags: tags as Track["tags"]
  };
}

describe("formatArtistList", () => {
  it("returns undefined when empty", () => {
    expect(formatArtistList([])).toBeUndefined();
  });

  it("returns the only artist when length is 1", () => {
    expect(formatArtistList(["A"])).toBe("A");
  });

  it("joins two artists with ' and '", () => {
    expect(formatArtistList(["A", "B"])).toBe("A and B");
  });

  it("joins three or more artists with comma + ' and '", () => {
    expect(formatArtistList(["A", "B", "C"])).toBe("A, B and C");
    expect(formatArtistList(["A", "B", "C", "D"])).toBe("A, B, C and D");
  });
});

describe("getTrackArtistList", () => {
  it("splits a semicolon-delimited artist string", () => {
    expect(getTrackArtistList(makeTrack({ artist: "A; B; C" }))).toEqual(["A", "B", "C"]);
  });

  it("trims whitespace around separators", () => {
    expect(getTrackArtistList(makeTrack({ artist: "A ;  B  ;C" }))).toEqual(["A", "B", "C"]);
  });

  it("uses the artists array when provided", () => {
    expect(getTrackArtistList(makeTrack({ artists: ["A", "B"] }))).toEqual(["A", "B"]);
  });

  it("dedupes between artist string and artists array", () => {
    expect(
      getTrackArtistList(makeTrack({ artist: "A; B", artists: ["A", "C"] }))
    ).toEqual(["A", "B", "C"]);
  });

  it("falls back to album artist only when no artist tags exist", () => {
    expect(getTrackArtistList(makeTrack({ albumArtist: "X" }))).toEqual(["X"]);
  });

  it("returns an empty array when no artist data is present", () => {
    expect(getTrackArtistList(makeTrack({}))).toEqual([]);
  });
});

describe("getTrackPrimaryArtist", () => {
  it("returns the first artist from a semicolon-delimited string", () => {
    expect(getTrackPrimaryArtist(makeTrack({ artist: "A; B; C" }))).toBe("A");
  });

  it("returns undefined when no artist data is present", () => {
    expect(getTrackPrimaryArtist(makeTrack({}))).toBeUndefined();
  });
});

describe("getTrackDisplayArtist", () => {
  it("formats two artists with ' and '", () => {
    expect(getTrackDisplayArtist(makeTrack({ artist: "A; B" }))).toBe("A and B");
  });

  it("formats three artists with comma + ' and '", () => {
    expect(getTrackDisplayArtist(makeTrack({ artist: "A; B; C" }))).toBe("A, B and C");
  });

  it("returns a single artist as-is", () => {
    expect(getTrackDisplayArtist(makeTrack({ artist: "A" }))).toBe("A");
  });

  it("returns undefined when no artist data is present", () => {
    expect(getTrackDisplayArtist(makeTrack({}))).toBeUndefined();
  });
});
