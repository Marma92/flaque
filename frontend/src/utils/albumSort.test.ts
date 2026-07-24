import { describe, expect, it } from "vitest";

import type { AlbumEntry } from "../types";
import {
  DEFAULT_ALBUM_SORT_MODE,
  isAlbumSortMode,
  sortAlbums,
  sortAndGroupAlbums
} from "./albumSort";

function album(input: Partial<AlbumEntry> & { name: string }): AlbumEntry {
  return {
    name: input.name,
    artist: input.artist,
    trackCount: input.trackCount ?? 1,
    year: input.year,
    cover: input.cover,
    totalDuration: input.totalDuration,
    id: input.id,
    artists: input.artists,
    previewTrackId: input.previewTrackId
  };
}

describe("isAlbumSortMode", () => {
  it("accepts known modes", () => {
    expect(isAlbumSortMode("album-asc")).toBe(true);
    expect(isAlbumSortMode("year-desc")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isAlbumSortMode("foo")).toBe(false);
    expect(isAlbumSortMode(null)).toBe(false);
    expect(isAlbumSortMode(undefined)).toBe(false);
    expect(isAlbumSortMode(42)).toBe(false);
  });
});

describe("sortAlbums — album name", () => {
  it("sorts ascending by album name", () => {
    const sorted = sortAlbums(
      [album({ name: "Charlie" }), album({ name: "Alpha" }), album({ name: "Bravo" })],
      "album-asc"
    );
    expect(sorted.map((a) => a.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts descending by album name", () => {
    const sorted = sortAlbums(
      [album({ name: "Alpha" }), album({ name: "Charlie" }), album({ name: "Bravo" })],
      "album-desc"
    );
    expect(sorted.map((a) => a.name)).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("places non-alphabetical names in the # bucket at the end (asc and desc)", () => {
    const items = [album({ name: "Alpha" }), album({ name: "1999" }), album({ name: "Bravo" })];

    const asc = sortAlbums(items, "album-asc");
    expect(asc.map((a) => a.name)).toEqual(["Alpha", "Bravo", "1999"]);

    const desc = sortAlbums(items, "album-desc");
    expect(desc.map((a) => a.name)).toEqual(["Bravo", "Alpha", "1999"]);
  });
});

describe("sortAlbums — artist", () => {
  it("sorts by artist with leading 'The' ignored", () => {
    const sorted = sortAlbums(
      [
        album({ name: "A1", artist: "The Beatles" }),
        album({ name: "A2", artist: "Arctic Monkeys" }),
        album({ name: "A3", artist: "Coldplay" })
      ],
      "artist-asc"
    );
    expect(sorted.map((a) => a.artist)).toEqual(["Arctic Monkeys", "The Beatles", "Coldplay"]);
  });

  it("falls back to album-name order within the same artist", () => {
    const sorted = sortAlbums(
      [
        album({ name: "Zebra", artist: "Pink Floyd" }),
        album({ name: "Animals", artist: "Pink Floyd" })
      ],
      "artist-asc"
    );
    expect(sorted.map((a) => a.name)).toEqual(["Animals", "Zebra"]);
  });
});

describe("sortAlbums — year", () => {
  it("sorts year ascending and pushes unknown to the end", () => {
    const sorted = sortAlbums(
      [
        album({ name: "B", year: 2020 }),
        album({ name: "A", year: 1999 }),
        album({ name: "C" }),
        album({ name: "D", year: 2010 })
      ],
      "year-asc"
    );
    expect(sorted.map((a) => a.name)).toEqual(["A", "D", "B", "C"]);
  });

  it("sorts year descending and pushes unknown to the end", () => {
    const sorted = sortAlbums(
      [
        album({ name: "B", year: 2020 }),
        album({ name: "A", year: 1999 }),
        album({ name: "C" }),
        album({ name: "D", year: 2010 })
      ],
      "year-desc"
    );
    expect(sorted.map((a) => a.name)).toEqual(["B", "D", "A", "C"]);
  });
});

describe("sortAndGroupAlbums", () => {
  it("groups alphabetical sort by first letter with # bucket last", () => {
    const groups = sortAndGroupAlbums(
      [
        album({ name: "Alpha" }),
        album({ name: "Bravo" }),
        album({ name: "1999" }),
        album({ name: "Apple" })
      ],
      "album-asc"
    );
    expect(groups.map((g) => g.label)).toEqual(["A", "B", "#"]);
    expect(groups[0]!.albums.map((a) => a.name)).toEqual(["Alpha", "Apple"]);
    expect(groups[2]!.albums.map((a) => a.name)).toEqual(["1999"]);
  });

  it("groups artist sort by artist first letter (ignoring leading The)", () => {
    const groups = sortAndGroupAlbums(
      [
        album({ name: "A1", artist: "The Beatles" }),
        album({ name: "A2", artist: "Arctic Monkeys" })
      ],
      "artist-asc"
    );
    // "Arctic Monkeys" → A, "The Beatles" → B (after stripping "The")
    expect(groups.map((g) => g.label)).toEqual(["A", "B"]);
  });

  it("groups year sort by year with Unknown bucket last", () => {
    const groups = sortAndGroupAlbums(
      [
        album({ name: "A", year: 2020 }),
        album({ name: "B", year: 2020 }),
        album({ name: "C", year: 1999 }),
        album({ name: "D" })
      ],
      "year-desc"
    );
    expect(groups.map((g) => g.label)).toEqual(["2020", "1999", "Unknown"]);
    expect(groups[0]!.albums.map((a) => a.name)).toEqual(["A", "B"]);
    expect(groups[2]!.albums).toHaveLength(1);
  });

  it("returns an empty list for empty input", () => {
    expect(sortAndGroupAlbums([], "album-asc")).toEqual([]);
  });
});

describe("DEFAULT_ALBUM_SORT_MODE", () => {
  it("is album-asc", () => {
    expect(DEFAULT_ALBUM_SORT_MODE).toBe("album-asc");
  });
});
