import { describe, expect, it } from "vitest";

import type { Track } from "../../types/library";
import {
  filterTracks,
  getAdjacentTrack,
  listAlbums,
  listArtists,
  listOwners,
  paginateTracks,
  sortTracks
} from "./libraryQuery";

const tracks: Track[] = [
  {
    id: "1",
    owner: "alice",
    path: "storage/users/alice/uploads/a.flac",
    duration: 120,
    mimeType: "audio/flac",
    codec: "flac",
    tags: {
      title: "Song A",
      artist: "Artist One",
      album: "Album One"
    }
  },
  {
    id: "2",
    owner: "alice",
    path: "storage/users/alice/uploads/b.flac",
    duration: 140,
    mimeType: "audio/flac",
    codec: "flac",
    tags: {
      title: "Song B",
      artist: "Artist One",
      album: "Album Two"
    }
  },
  {
    id: "3",
    owner: "bob",
    path: "storage/users/bob/uploads/c.mp3",
    duration: 90,
    mimeType: "audio/mpeg",
    codec: "mp3",
    tags: {
      title: "Song C",
      album: "Album Three",
      albumArtist: "Artist Two",
      year: 2023
    }
  }
];

describe("libraryQuery", () => {
  it("filters tracks by owner, artist, album and text", () => {
    expect(filterTracks(tracks, { owner: "alice" })).toHaveLength(2);
    expect(filterTracks(tracks, { artist: "artist one" })).toHaveLength(2);
    expect(filterTracks(tracks, { artist: "artist two" })).toHaveLength(1);
    expect(filterTracks(tracks, { album: "album three" })).toHaveLength(1);
    expect(filterTracks(tracks, { q: "song c" })).toHaveLength(1);
    expect(filterTracks(tracks, { q: "2023" })).toHaveLength(1);
  });

  it("lists owners, artists and albums", () => {
    expect(listOwners(tracks)).toEqual(["alice", "bob"]);
    expect(listArtists(tracks)).toEqual([
      { name: "Artist One", normalizedName: "alice", albumCount: 2, trackCount: 2, totalDuration: 260 },
      { name: "Artist Two", normalizedName: "bob", albumCount: 1, trackCount: 1, totalDuration: 90 }
    ]);
    expect(listAlbums(tracks)).toEqual([
      { artist: "Artist One", name: "Album One", trackCount: 1 },
      { artist: "Artist One", name: "Album Two", trackCount: 1 },
      { artist: "Artist Two", name: "Album Three", trackCount: 1 }
    ]);
  });

  it("returns adjacent tracks with and without wrap", () => {
    expect(getAdjacentTrack(tracks, "1", "next", false)?.id).toBe("2");
    expect(getAdjacentTrack(tracks, "1", "previous", false)).toBeNull();
    expect(getAdjacentTrack(tracks, "1", "previous", true)?.id).toBe("3");
    expect(getAdjacentTrack(tracks, "3", "next", true)?.id).toBe("1");
    expect(getAdjacentTrack(tracks, "missing", "next", true)).toBeNull();
  });

  it("sorts tracks by selected field and direction", () => {
    expect(sortTracks(tracks, "duration", "desc").map((track) => track.id)).toEqual(["2", "1", "3"]);
    expect(sortTracks(tracks, "title", "asc").map((track) => track.id)).toEqual(["1", "2", "3"]);
    expect(sortTracks(tracks, "owner", "asc").map((track) => track.id)).toEqual(["1", "2", "3"]);
  });

  it("paginates tracks with metadata", () => {
    const pageOne = paginateTracks(tracks, 1, 2);
    expect(pageOne).toMatchObject({
      total: 3,
      page: 1,
      limit: 2,
      totalPages: 2
    });
    expect(pageOne.tracks.map((track) => track.id)).toEqual(["1", "2"]);

    const pageTwo = paginateTracks(tracks, 2, 2);
    expect(pageTwo.page).toBe(2);
    expect(pageTwo.tracks.map((track) => track.id)).toEqual(["3"]);
  });

  // ── Edge cases: empty inputs ────────────────────────────────────────

  it("handles empty track array gracefully", () => {
    expect(filterTracks([], { owner: "alice" })).toEqual([]);
    expect(listOwners([])).toEqual([]);
    expect(listArtists([])).toEqual([]);
    expect(listAlbums([])).toEqual([]);
    expect(getAdjacentTrack([], "1", "next")).toBeNull();
    expect(sortTracks([], "title")).toEqual([]);

    const emptyPage = paginateTracks([], 1, 10);
    expect(emptyPage).toMatchObject({ total: 0, page: 1, totalPages: 0, tracks: [] });
  });

  // ── Edge cases: filterTracks ────────────────────────────────────────

  it("returns all tracks when no filter is set", () => {
    expect(filterTracks(tracks, {})).toHaveLength(3);
    expect(filterTracks(tracks, { owner: undefined, artist: undefined })).toHaveLength(3);
  });

  it("filters with combined owner + artist", () => {
    expect(filterTracks(tracks, { owner: "alice", artist: "artist one" })).toHaveLength(2);
    expect(filterTracks(tracks, { owner: "bob", artist: "artist one" })).toHaveLength(0);
  });

  it("searches by genre, composer, and extra tags", () => {
    const tracksWithMeta: Track[] = [
      {
        id: "m1",
        owner: "alice",
        path: "a/b/c.flac",
        duration: 100,
        mimeType: "audio/flac",
        codec: "flac",
        tags: {
          title: "Opus",
          artist: "Composer X",
          genre: ["jazz", "fusion"],
          composer: ["Bach"],
          comment: ["live recording"],
          extra: { mood: "chill" }
        }
      }
    ];

    expect(filterTracks(tracksWithMeta, { q: "jazz" })).toHaveLength(1);
    expect(filterTracks(tracksWithMeta, { q: "bach" })).toHaveLength(1);
    expect(filterTracks(tracksWithMeta, { q: "live recording" })).toHaveLength(1);
    expect(filterTracks(tracksWithMeta, { q: "chill" })).toHaveLength(1);
    expect(filterTracks(tracksWithMeta, { q: "nonexistent" })).toHaveLength(0);
  });

  it("searches by year from tags.year or tags.date", () => {
    expect(filterTracks(tracks, { q: "2023" })).toHaveLength(1);

    const tracksWithDate: Track[] = [
      {
        id: "d1",
        owner: "eve",
        path: "x/y/z.flac",
        duration: 60,
        mimeType: "audio/flac",
        codec: "flac",
        tags: { title: "Date Song", date: "2019-05-12" }
      }
    ];
    expect(filterTracks(tracksWithDate, { q: "2019" })).toHaveLength(1);
  });

  // ── Edge cases: tracks with missing fields ──────────────────────────

  it("handles tracks with missing tags for listArtists and listAlbums", () => {
    const sparse: Track[] = [
      {
        id: "s1",
        owner: "alice",
        path: "a/b/c.flac",
        duration: 60,
        mimeType: "audio/flac",
        codec: "flac",
        tags: {}
      }
    ];

    // Track with no artist should not appear in artist listing
    expect(listArtists(sparse)).toEqual([]);
    // Track with no album should not appear in album listing
    expect(listAlbums(sparse)).toEqual([]);
  });

  it('sorts artists ignoring a leading "The"', () => {
    const theTracks: Track[] = [
      { id: "1", owner: "u", path: "p/1.flac", duration: 0, mimeType: "audio/flac", codec: "flac", tags: { title: "t1", artist: "Zebra" } },
      { id: "2", owner: "u", path: "p/2.flac", duration: 0, mimeType: "audio/flac", codec: "flac", tags: { title: "t2", artist: "The Beatles" } },
      { id: "3", owner: "u", path: "p/3.flac", duration: 0, mimeType: "audio/flac", codec: "flac", tags: { title: "t3", artist: "Arcade Fire" } }
    ];

    expect(listArtists(theTracks).map((a) => a.name)).toEqual([
      "Arcade Fire",
      "The Beatles",
      "Zebra"
    ]);

    expect(sortTracks(theTracks, "artist", "asc").map((t) => t.id)).toEqual(["3", "2", "1"]);
  });

  it('sorts albums by artist ignoring a leading "The"', () => {
    const theTracks: Track[] = [
      { id: "1", owner: "u", path: "p/1.flac", duration: 0, mimeType: "audio/flac", codec: "flac", tags: { title: "t1", artist: "Zebra", album: "Zoo" } },
      { id: "2", owner: "u", path: "p/2.flac", duration: 0, mimeType: "audio/flac", codec: "flac", tags: { title: "t2", artist: "The Beatles", album: "Abbey Road" } },
      { id: "3", owner: "u", path: "p/3.flac", duration: 0, mimeType: "audio/flac", codec: "flac", tags: { title: "t3", artist: "Arcade Fire", album: "Funeral" } }
    ];

    expect(listAlbums(theTracks).map((a) => `${a.artist}/${a.name}`)).toEqual([
      "Arcade Fire/Funeral",
      "The Beatles/Abbey Road",
      "Zebra/Zoo"
    ]);
  });

  // ── Edge cases: sortTracks ──────────────────────────────────────────

  it("sorts by all supported fields without crashing", () => {
    const fields: Array<Parameters<typeof sortTracks>[1]> = [
      "title", "artist", "album", "owner", "duration",
      "codec", "bitrate", "sampleRate", "path", "addedAt"
    ];

    for (const field of fields) {
      const sorted = sortTracks(tracks, field, "asc");
      expect(sorted).toHaveLength(3);
      const sortedDesc = sortTracks(tracks, field, "desc");
      expect(sortedDesc).toHaveLength(3);
    }
  });

  it("uses stable sort (breaks ties by id)", () => {
    const sameDuration: Track[] = [
      { id: "b", owner: "x", path: "p", duration: 100, mimeType: "audio/flac", codec: "flac", tags: {} },
      { id: "a", owner: "x", path: "p", duration: 100, mimeType: "audio/flac", codec: "flac", tags: {} },
      { id: "c", owner: "x", path: "p", duration: 100, mimeType: "audio/flac", codec: "flac", tags: {} }
    ];

    expect(sortTracks(sameDuration, "duration", "asc").map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(sortTracks(sameDuration, "duration", "desc").map((t) => t.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts tracks with missing optional numeric fields (bitrate, sampleRate)", () => {
    const mixed: Track[] = [
      { id: "1", owner: "x", path: "p", duration: 100, mimeType: "audio/flac", codec: "flac", bitrate: 320, tags: {} },
      { id: "2", owner: "x", path: "p", duration: 100, mimeType: "audio/flac", codec: "flac", tags: {} },
      { id: "3", owner: "x", path: "p", duration: 100, mimeType: "audio/flac", codec: "flac", bitrate: 128, tags: {} }
    ];

    const sorted = sortTracks(mixed, "bitrate", "asc");
    // undefined bitrate maps to -1, so id "2" comes first
    expect(sorted.map((t) => t.id)).toEqual(["2", "3", "1"]);
  });

  // ── Edge cases: paginateTracks ──────────────────────────────────────

  it("clamps page to valid range", () => {
    const result = paginateTracks(tracks, 999, 2);
    expect(result.page).toBe(2); // last valid page
    expect(result.tracks).toHaveLength(1);

    const resultLow = paginateTracks(tracks, 0, 2);
    expect(resultLow.page).toBe(1);
  });

  it("falls back to default limit for invalid values", () => {
    const result = paginateTracks(tracks, 1, 0);
    expect(result.limit).toBe(100);
    expect(result.tracks).toHaveLength(3);

    const resultNeg = paginateTracks(tracks, 1, -5);
    expect(resultNeg.limit).toBe(100);
  });

  it("handles single-item pagination", () => {
    const result = paginateTracks(tracks, 1, 1);
    expect(result.totalPages).toBe(3);
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]!.id).toBe("1");
  });

  // ── Edge cases: getAdjacentTrack ────────────────────────────────────

  it("returns null for single-track list without wrap at boundaries", () => {
    const single = [tracks[0]!];
    expect(getAdjacentTrack(single, "1", "next", false)).toBeNull();
    expect(getAdjacentTrack(single, "1", "previous", false)).toBeNull();
  });

  it("wraps around for single-track list with wrap enabled", () => {
    const single = [tracks[0]!];
    expect(getAdjacentTrack(single, "1", "next", true)?.id).toBe("1");
    expect(getAdjacentTrack(single, "1", "previous", true)?.id).toBe("1");
  });
});
