import { describe, expect, it } from "vitest";

import type { Track } from "../../types/library";
import { filterTracks, listAlbums, listArtists, listOwners } from "./libraryQuery";

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
      artist: "Artist Two",
      album: "Album Three"
    }
  }
];

describe("libraryQuery", () => {
  it("filters tracks by owner, artist, album and text", () => {
    expect(filterTracks(tracks, { owner: "alice" })).toHaveLength(2);
    expect(filterTracks(tracks, { artist: "artist one" })).toHaveLength(2);
    expect(filterTracks(tracks, { album: "album three" })).toHaveLength(1);
    expect(filterTracks(tracks, { q: "song c" })).toHaveLength(1);
  });

  it("lists owners, artists and albums", () => {
    expect(listOwners(tracks)).toEqual(["alice", "bob"]);
    expect(listArtists(tracks)).toEqual([
      { name: "Artist One", trackCount: 2 },
      { name: "Artist Two", trackCount: 1 }
    ]);
    expect(listAlbums(tracks)).toEqual([
      { artist: "Artist One", name: "Album One", trackCount: 1 },
      { artist: "Artist One", name: "Album Two", trackCount: 1 },
      { artist: "Artist Two", name: "Album Three", trackCount: 1 }
    ]);
  });
});
