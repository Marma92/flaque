import { describe, expect, it } from "vitest";

import type { Track } from "../types/library";
import {
  extractPrimaryArtist,
  getTrackAlbum,
  getTrackArtist,
  getTrackArtistName,
  getTrackTitle,
  normalizeIndexKey
} from "./music";

function makeTrack(tags: Track["tags"]): Track {
  return {
    id: "test-id",
    owner: "test-owner",
    path: "storage/music/artist/album/abc.flac",
    duration: 180,
    mimeType: "audio/flac",
    codec: "flac",
    tags
  };
}

describe("extractPrimaryArtist", () => {
  it("returns the name unchanged when there is no separator", () => {
    expect(extractPrimaryArtist("Sleep Token")).toBe("Sleep Token");
  });

  it("splits on semicolon and returns the first artist", () => {
    expect(extractPrimaryArtist("Artist A; Artist B")).toBe("Artist A");
    expect(extractPrimaryArtist("Artist A;Artist B")).toBe("Artist A");
    expect(extractPrimaryArtist("Artist A ;  Artist B ; Artist C")).toBe("Artist A");
  });

  it("splits on feat. and returns the first artist", () => {
    expect(extractPrimaryArtist("Artist A feat. Artist B")).toBe("Artist A");
    expect(extractPrimaryArtist("Artist A FEAT. Artist B")).toBe("Artist A");
  });

  it("splits on ft. and returns the first artist", () => {
    expect(extractPrimaryArtist("Artist A ft. Artist B")).toBe("Artist A");
    expect(extractPrimaryArtist("Artist A FT. Artist B")).toBe("Artist A");
  });

  it("handles combined separators", () => {
    expect(extractPrimaryArtist("Artist A; Artist B feat. Artist C")).toBe("Artist A");
  });

  it("returns the original string for edge cases", () => {
    expect(extractPrimaryArtist("")).toBe("");
    expect(extractPrimaryArtist("  ")).toBe("  ");
  });

  it("trims whitespace from the primary artist", () => {
    expect(extractPrimaryArtist("  Artist A  ; Artist B")).toBe("Artist A");
  });
});

describe("getTrackArtist", () => {
  it("returns artist tag when present", () => {
    expect(getTrackArtist(makeTrack({ artist: "Artist A" }))).toBe("Artist A");
  });

  it("falls back to albumArtist", () => {
    expect(getTrackArtist(makeTrack({ albumArtist: "Album Artist" }))).toBe("Album Artist");
  });

  it("falls back to first artists entry", () => {
    expect(getTrackArtist(makeTrack({ artists: ["First", "Second"] }))).toBe("First");
  });

  it("returns empty string when no artist info is available", () => {
    expect(getTrackArtist(makeTrack({}))).toBe("");
  });

  it("extracts primary artist from multi-artist tag", () => {
    expect(getTrackArtist(makeTrack({ artist: "Artist A; Artist B" }))).toBe("Artist A");
  });
});

describe("getTrackArtistName", () => {
  it("returns artist name when present", () => {
    expect(getTrackArtistName(makeTrack({ artist: "Artist A" }))).toBe("Artist A");
  });

  it("returns undefined when no artist info is available", () => {
    expect(getTrackArtistName(makeTrack({}))).toBeUndefined();
  });

  it("extracts primary artist from multi-artist tag", () => {
    expect(getTrackArtistName(makeTrack({ artist: "X ft. Y" }))).toBe("X");
  });
});

describe("getTrackAlbum", () => {
  it("returns album tag", () => {
    expect(getTrackAlbum(makeTrack({ album: "My Album" }))).toBe("My Album");
  });

  it("returns empty string when album is missing", () => {
    expect(getTrackAlbum(makeTrack({}))).toBe("");
  });
});

describe("getTrackTitle", () => {
  it("returns title tag", () => {
    expect(getTrackTitle(makeTrack({ title: "My Song" }))).toBe("My Song");
  });

  it("falls back to path when title is missing", () => {
    const track = makeTrack({});
    expect(getTrackTitle(track)).toBe(track.path);
  });
});

describe("normalizeIndexKey", () => {
  it("lowercases and trims", () => {
    expect(normalizeIndexKey("  Hello World  ")).toBe("hello world");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeIndexKey(undefined)).toBe("");
    expect(normalizeIndexKey()).toBe("");
  });
});
