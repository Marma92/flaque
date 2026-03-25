import fs from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryIndex, Track } from "../types/library";

let dataRoot = "";
let baseUrl = "";
let server: Server | null = null;

type FakeIndexStoreOptions = {
  initialSnapshot: LibraryIndex;
  rebuildSnapshot: LibraryIndex;
};

class FakeIndexStore {
  private snapshot: LibraryIndex;

  private tracksById = new Map<string, Track>();

  private tracksByOwner = new Map<string, Track[]>();

  private tracksByArtist = new Map<string, Track[]>();

  private tracksByAlbum = new Map<string, Track[]>();

  private readonly rebuildSnapshot: LibraryIndex;

  constructor(options: FakeIndexStoreOptions) {
    this.snapshot = options.initialSnapshot;
    this.rebuildSnapshot = options.rebuildSnapshot;
    this.rebuildIndexes();
  }

  getSnapshot(): LibraryIndex {
    return this.snapshot;
  }

  getTracks(): Track[] {
    return this.snapshot.tracks;
  }

  getTrackById(trackId: string): Track | undefined {
    return this.tracksById.get(trackId);
  }

  hasTrack(trackId: string): boolean {
    return this.tracksById.has(trackId);
  }

  getTracksByOwner(owner: string): Track[] {
    return [...(this.tracksByOwner.get(this.normalize(owner)) ?? [])];
  }

  getTracksByArtist(artist: string): Track[] {
    return [...(this.tracksByArtist.get(this.normalize(artist)) ?? [])];
  }

  getTracksByAlbum(album: string): Track[] {
    return [...(this.tracksByAlbum.get(this.normalize(album)) ?? [])];
  }

  async rebuild(): Promise<LibraryIndex> {
    this.snapshot = this.rebuildSnapshot;
    this.rebuildIndexes();
    return this.rebuildSnapshot;
  }

  private normalize(value?: string): string {
    return (value ?? "").trim().toLowerCase();
  }

  private getTrackArtist(track: Track): string | undefined {
    return track.tags.artist ?? track.tags.albumArtist ?? track.tags.artists?.[0];
  }

  private pushToIndex(map: Map<string, Track[]>, key: string | undefined, track: Track): void {
    const normalizedKey = this.normalize(key);
    if (!normalizedKey) {
      return;
    }

    const tracks = map.get(normalizedKey);
    if (tracks) {
      tracks.push(track);
      return;
    }

    map.set(normalizedKey, [track]);
  }

  private rebuildIndexes(): void {
    this.tracksById = new Map<string, Track>();
    this.tracksByOwner = new Map<string, Track[]>();
    this.tracksByArtist = new Map<string, Track[]>();
    this.tracksByAlbum = new Map<string, Track[]>();

    for (const track of this.snapshot.tracks) {
      this.tracksById.set(track.id, track);
      this.pushToIndex(this.tracksByOwner, track.owner, track);
      this.pushToIndex(this.tracksByArtist, this.getTrackArtist(track), track);
      this.pushToIndex(this.tracksByAlbum, track.tags.album, track);
    }
  }
}

async function bootstrapServer(indexStore: FakeIndexStore): Promise<void> {
  vi.resetModules();

  const { ensureBaseDirectories } = await import("../utils/fs");
  const { initializeAuthDatabase, ensureDefaultAdmin } = await import("../auth/db");
  const { createApp } = await import("../app");

  await ensureBaseDirectories();
  initializeAuthDatabase();
  ensureDefaultAdmin();

  const app = createApp(indexStore as unknown as import("../services/indexer/indexStore").IndexStore);
  server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    if (!server) {
      reject(new Error("Missing HTTP server"));
      return;
    }

    server.listen(0, "127.0.0.1", () => {
      const address = server?.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to resolve test server address"));
        return;
      }

      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

async function apiRequest(pathname: string, options: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  let payload: unknown = undefined;

  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  return {
    status: response.status,
    payload,
    cookie: response.headers.get("set-cookie")
  };
}

async function login(username: string, password: string): Promise<string> {
  const response = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  expect(response.status).toBe(200);
  const cookie = response.cookie;
  if (!cookie) {
    throw new Error("Missing session cookie");
  }

  return cookie.split(";", 1)[0] ?? "";
}

function createTrack(id: string, title: string): Track {
  return {
    id,
    owner: "owner-1",
    path: "storage/users/owner-1/uploads/test.flac",
    duration: 120,
    mimeType: "audio/flac",
    codec: "flac",
    tags: {
      title,
      artist: "Artist",
      album: "Album"
    },
    cover: `/api/covers/${id}`
  };
}

function createNestedTrack(id: string, title: string, artist: string, album: string, relativePath: string): Track {
  return {
    id,
    owner: "owner-1",
    path: relativePath,
    duration: 120,
    mimeType: "audio/flac",
    codec: "flac",
    tags: {
      title,
      artist,
      album
    },
    cover: `/api/covers/${id}`
  };
}

beforeEach(async () => {
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "flaque-metadata-routes-"));
  process.env.DATA_ROOT = dataRoot;
  process.env.ADMIN_USERNAME = "admin";
  process.env.ADMIN_PASSWORD = "admin-secret-123";
  process.env.ADMIN_EMAIL = "admin@test.local";
  process.env.CORS_ORIGIN = "http://localhost:5173";
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  await fs.rm(dataRoot, { recursive: true, force: true });
  delete process.env.DATA_ROOT;
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_EMAIL;
  delete process.env.CORS_ORIGIN;
  server = null;
  baseUrl = "";
  vi.resetModules();
});

describe("library metadata routes", () => {
  it("returns consistent filtered data for /library and /tracks", async () => {
    const trackOne = createNestedTrack(
      "track-filter-1",
      "Song A",
      "Artist A",
      "Album A",
      "storage/users/owner-1/uploads/artist_a/album_a/song-a.flac"
    );
    const trackTwo = createNestedTrack(
      "track-filter-2",
      "Song B",
      "Artist B",
      "Album B",
      "storage/users/owner-1/uploads/artist_b/album_b/song-b.flac"
    );
    const trackThree = createNestedTrack(
      "track-filter-3",
      "Song C",
      "Artist A",
      "Album C",
      "storage/users/owner-2/uploads/artist_a/album_c/song-c.flac"
    );

    const snapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 3,
      tracks: [trackOne, trackTwo, trackThree]
    };

    const indexStore = new FakeIndexStore({
      initialSnapshot: snapshot,
      rebuildSnapshot: snapshot
    });

    await bootstrapServer(indexStore);
    const cookie = await login("admin", "admin-secret-123");

    const libraryResponse = await apiRequest("/api/library?artist=Artist%20A", {
      headers: {
        Cookie: cookie
      }
    });
    expect(libraryResponse.status).toBe(200);
    expect(libraryResponse.payload).toEqual(
      expect.objectContaining({
        totalTracks: 2,
        tracks: expect.arrayContaining([
          expect.objectContaining({ id: trackOne.id }),
          expect.objectContaining({ id: trackThree.id })
        ])
      })
    );

    const tracksResponse = await apiRequest("/api/tracks?artist=Artist%20A&sortBy=title&sortDir=asc", {
      headers: {
        Cookie: cookie
      }
    });
    expect(tracksResponse.status).toBe(200);
    expect(tracksResponse.payload).toEqual(
      expect.objectContaining({
        total: 2,
        tracks: expect.arrayContaining([
          expect.objectContaining({ id: trackOne.id }),
          expect.objectContaining({ id: trackThree.id })
        ])
      })
    );
  });

  it("accepts metadata patch on /tracks/:id/metadata", async () => {
    const track = createTrack("track-1", "Original");
    const snapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 1,
      tracks: [track]
    };

    const indexStore = new FakeIndexStore({
      initialSnapshot: snapshot,
      rebuildSnapshot: snapshot
    });

    await bootstrapServer(indexStore);

    const cookie = await login("admin", "admin-secret-123");

    const patchResponse = await apiRequest(`/api/tracks/${encodeURIComponent(track.id)}/metadata`, {
      method: "PATCH",
      headers: {
        Cookie: cookie
      },
      body: JSON.stringify({ title: "Updated" })
    });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.payload).toEqual(
      expect.objectContaining({
        track: expect.objectContaining({
          id: track.id
        })
      })
    );
  });

  it("does not return 404 when rebuild omits an existing track", async () => {
    const track = createTrack("track-2", "Original 2");
    const initialSnapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 1,
      tracks: [track]
    };
    const rebuiltWithoutTrack: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 0,
      tracks: []
    };

    const indexStore = new FakeIndexStore({
      initialSnapshot,
      rebuildSnapshot: rebuiltWithoutTrack
    });

    await bootstrapServer(indexStore);

    const cookie = await login("admin", "admin-secret-123");

    const patchResponse = await apiRequest(`/api/tracks/${encodeURIComponent(track.id)}/metadata`, {
      method: "PATCH",
      headers: {
        Cookie: cookie
      },
      body: JSON.stringify({ title: "Fallback title" })
    });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.payload).toEqual(
      expect.objectContaining({
        warning: expect.any(String),
        track: expect.objectContaining({
          id: track.id,
          tags: expect.objectContaining({
            title: "Fallback title"
          })
        })
      })
    );
  });

  it("supports metadata patch on /tracks/:id for compatibility", async () => {
    const track = createTrack("track-3", "Original 3");
    const snapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 1,
      tracks: [track]
    };

    const indexStore = new FakeIndexStore({
      initialSnapshot: snapshot,
      rebuildSnapshot: snapshot
    });

    await bootstrapServer(indexStore);

    const cookie = await login("admin", "admin-secret-123");

    const patchResponse = await apiRequest(`/api/tracks/${encodeURIComponent(track.id)}`, {
      method: "PATCH",
      headers: {
        Cookie: cookie
      },
      body: JSON.stringify({ artist: "New Artist" })
    });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.payload).toEqual(
      expect.objectContaining({
        track: expect.objectContaining({
          id: track.id
        })
      })
    );
  });

  it("returns artist photos and album covers from metadata routes", async () => {
    const artist = "The Beatles";
    const album = "Abbey Road";
    const artistSlug = "the_beatles";
    const albumSlug = "abbey_road";
    const artistPhotoPath = `storage/users/owner-1/uploads/${artistSlug}/artist-photo.jpg`;
    const albumCoverPath = `storage/users/owner-1/uploads/${artistSlug}/${albumSlug}/album-cover.jpg`;

    const track = createNestedTrack(
      "track-4",
      "Come Together",
      artist,
      album,
      `storage/users/owner-1/uploads/${artistSlug}/${albumSlug}/come-together.flac`
    );

    const snapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 1,
      tracks: [track]
    };

    const artistDir = path.join(dataRoot, "storage", "users", "owner-1", "uploads", artistSlug);
    const albumDir = path.join(artistDir, albumSlug);
    await fs.mkdir(albumDir, { recursive: true });
    await fs.writeFile(path.join(artistDir, "artist.json"), JSON.stringify({ name: artist, photo: { path: artistPhotoPath } }));
    await fs.writeFile(
      path.join(albumDir, "album.json"),
      JSON.stringify({ id: "album-abbey-road", name: album, cover: { path: albumCoverPath } })
    );
    await fs.writeFile(path.join(artistDir, "artist-photo.jpg"), "artist-photo");
    await fs.writeFile(path.join(albumDir, "album-cover.jpg"), "album-cover");

    const indexStore = new FakeIndexStore({
      initialSnapshot: snapshot,
      rebuildSnapshot: snapshot
    });

    await bootstrapServer(indexStore);
    const cookie = await login("admin", "admin-secret-123");

    const artistsResponse = await apiRequest("/api/artists", {
      headers: {
        Cookie: cookie
      }
    });

    expect(artistsResponse.status).toBe(200);
    expect(artistsResponse.payload).toEqual(
      expect.objectContaining({
        artists: expect.arrayContaining([
          expect.objectContaining({
            name: artist,
            photo: artistPhotoPath
          })
        ])
      })
    );

    const albumsResponse = await apiRequest("/api/albums", {
      headers: {
        Cookie: cookie
      }
    });

    expect(albumsResponse.status).toBe(200);
    expect(albumsResponse.payload).toEqual(
      expect.objectContaining({
        albums: expect.arrayContaining([
          expect.objectContaining({
            id: "album-abbey-road",
            name: album,
            artist,
            cover: albumCoverPath
          })
        ])
      })
    );
  });

  it("returns album track list by album id", async () => {
    const artist = "Daft Punk";
    const album = "Discovery";
    const artistSlug = "daft_punk";
    const albumSlug = "discovery";
    const albumId = "album-discovery";
    const albumCoverPath = `storage/users/owner-1/uploads/${artistSlug}/${albumSlug}/album-cover.jpg`;

    const trackOne = createNestedTrack(
      "track-5",
      "One More Time",
      artist,
      album,
      `storage/users/owner-1/uploads/${artistSlug}/${albumSlug}/one-more-time.flac`
    );
    const trackTwo = createNestedTrack(
      "track-6",
      "Aerodynamic",
      artist,
      album,
      `storage/users/owner-1/uploads/${artistSlug}/${albumSlug}/aerodynamic.flac`
    );

    const snapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 2,
      tracks: [trackOne, trackTwo]
    };

    const albumDir = path.join(dataRoot, "storage", "users", "owner-1", "uploads", artistSlug, albumSlug);
    await fs.mkdir(albumDir, { recursive: true });
    await fs.writeFile(
      path.join(albumDir, "album.json"),
      JSON.stringify({
        id: albumId,
        name: album,
        cover: { path: albumCoverPath }
      })
    );
    await fs.writeFile(path.join(albumDir, "album-cover.jpg"), "album-cover");

    const indexStore = new FakeIndexStore({
      initialSnapshot: snapshot,
      rebuildSnapshot: snapshot
    });

    await bootstrapServer(indexStore);
    const cookie = await login("admin", "admin-secret-123");

    const albumResponse = await apiRequest(`/api/album/${encodeURIComponent(albumId)}`, {
      headers: {
        Cookie: cookie
      }
    });

    expect(albumResponse.status).toBe(200);
    expect(albumResponse.payload).toEqual(
      expect.objectContaining({
        album: expect.objectContaining({
          id: albumId,
          name: album,
          cover: albumCoverPath,
          trackCount: 2
        }),
        tracks: expect.arrayContaining([
          expect.objectContaining({ id: trackOne.id }),
          expect.objectContaining({ id: trackTwo.id })
        ])
      })
    );
  });

  it("returns all artists tracks for collaborative albums", async () => {
    const album = "KPop Demon Hunters";
    const owner = "owner-1";
    const collaborativeAlbumId = `collab:${album.toLowerCase()}`;
    const artistOneSlug = "ejae";
    const artistTwoSlug = "rumi";
    const albumSlug = "kpop_demon_hunters";

    const trackOne = createNestedTrack(
      "track-7",
      "How It's Done",
      "EJAE",
      album,
      `storage/users/${owner}/uploads/${artistOneSlug}/${albumSlug}/how-its-done.flac`
    );
    trackOne.tags.trackNumber = 2;
    trackOne.tags.artists = ["EJAE", "Rumi"];

    const trackTwo = createNestedTrack(
      "track-8",
      "Free",
      "Rumi",
      album,
      `storage/users/${owner}/uploads/${artistTwoSlug}/${albumSlug}/free.flac`
    );
    trackTwo.tags.trackNumber = 8;
    trackTwo.tags.artists = ["Rumi", "EJAE"];

    const snapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 2,
      tracks: [trackOne, trackTwo]
    };

    const artistOneAlbumDir = path.join(dataRoot, "storage", "users", owner, "uploads", artistOneSlug, albumSlug);
    const artistTwoAlbumDir = path.join(dataRoot, "storage", "users", owner, "uploads", artistTwoSlug, albumSlug);
    await fs.mkdir(artistOneAlbumDir, { recursive: true });
    await fs.mkdir(artistTwoAlbumDir, { recursive: true });
    await fs.writeFile(path.join(artistOneAlbumDir, "album.json"), JSON.stringify({ name: album }));
    await fs.writeFile(path.join(artistTwoAlbumDir, "album.json"), JSON.stringify({ name: album }));

    const indexStore = new FakeIndexStore({
      initialSnapshot: snapshot,
      rebuildSnapshot: snapshot
    });

    await bootstrapServer(indexStore);
    const cookie = await login("admin", "admin-secret-123");

    const albumResponse = await apiRequest(`/api/album/${encodeURIComponent(collaborativeAlbumId)}`, {
      headers: {
        Cookie: cookie
      }
    });

    expect(albumResponse.status).toBe(200);
    expect(albumResponse.payload).toEqual(
      expect.objectContaining({
        album: expect.objectContaining({
          id: collaborativeAlbumId,
          trackCount: 2,
          artist: "EJAE, Rumi"
        }),
        tracks: [
          expect.objectContaining({ id: trackOne.id }),
          expect.objectContaining({ id: trackTwo.id })
        ]
      })
    );
  });

  it("returns albums for a normalized artist directory name", async () => {
    const owner = "owner-1";
    const artistSlug = "ac_dc";
    const otherArtistSlug = "daft_punk";

    const trackOne = createNestedTrack(
      "track-10",
      "Back In Black",
      "AC/DC",
      "Back In Black",
      `storage/users/${owner}/uploads/${artistSlug}/back_in_black/back-in-black.flac`
    );

    const trackTwo = createNestedTrack(
      "track-11",
      "Hells Bells",
      "AC/DC",
      "Back In Black",
      `storage/users/${owner}/uploads/${artistSlug}/back_in_black/hells-bells.flac`
    );

    const trackThree = createNestedTrack(
      "track-12",
      "Thunderstruck",
      "AC/DC",
      "The Razors Edge",
      `storage/users/${owner}/uploads/${artistSlug}/the_razors_edge/thunderstruck.flac`
    );

    const otherArtistTrack = createNestedTrack(
      "track-13",
      "Harder Better Faster Stronger",
      "Daft Punk",
      "Discovery",
      `storage/users/${owner}/uploads/${otherArtistSlug}/discovery/harder-better-faster-stronger.flac`
    );

    const snapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 4,
      tracks: [trackOne, trackTwo, trackThree, otherArtistTrack]
    };

    const indexStore = new FakeIndexStore({
      initialSnapshot: snapshot,
      rebuildSnapshot: snapshot
    });

    await bootstrapServer(indexStore);
    const cookie = await login("admin", "admin-secret-123");

    const albumsResponse = await apiRequest(`/api/artists/${artistSlug}/albums`, {
      headers: {
        Cookie: cookie
      }
    });

    expect(albumsResponse.status).toBe(200);
    expect(albumsResponse.payload).toEqual(
      expect.objectContaining({
        total: 3,
        artist: artistSlug,
        albums: expect.arrayContaining([
          expect.objectContaining({
            name: "Back In Black",
            trackCount: 2
          }),
          expect.objectContaining({
            name: "The Razors Edge",
            trackCount: 1
          })
        ])
      })
    );

    expect(albumsResponse.payload).toEqual(
      expect.not.objectContaining({
        albums: expect.arrayContaining([
          expect.objectContaining({
            name: "Discovery"
          })
        ])
      })
    );
  });

  it("includes unknown album entries in album list", async () => {
    const owner = "owner-1";
    const artistSlug = "unknown_artist";
    const albumSlug = "unknown_album";
    const unknownAlbumId = "album-unknown";
    const unknownAlbumName = "Unknown Album";

    const unknownTrack = createNestedTrack(
      "track-9",
      "Mystery Track",
      "Unknown Artist",
      unknownAlbumName,
      `storage/users/${owner}/uploads/${artistSlug}/${albumSlug}/mystery-track.flac`
    );
    unknownTrack.tags.album = undefined;

    const snapshot: LibraryIndex = {
      generatedAt: new Date().toISOString(),
      totalTracks: 1,
      tracks: [unknownTrack]
    };

    const albumDir = path.join(dataRoot, "storage", "users", owner, "uploads", artistSlug, albumSlug);
    await fs.mkdir(albumDir, { recursive: true });
    await fs.writeFile(
      path.join(albumDir, "album.json"),
      JSON.stringify({
        id: unknownAlbumId,
        name: unknownAlbumName
      })
    );

    const indexStore = new FakeIndexStore({
      initialSnapshot: snapshot,
      rebuildSnapshot: snapshot
    });

    await bootstrapServer(indexStore);
    const cookie = await login("admin", "admin-secret-123");

    const albumsResponse = await apiRequest("/api/albums", {
      headers: {
        Cookie: cookie
      }
    });

    expect(albumsResponse.status).toBe(200);
    expect(albumsResponse.payload).toEqual(
      expect.objectContaining({
        albums: expect.arrayContaining([
          expect.objectContaining({
            id: unknownAlbumId,
            name: unknownAlbumName,
            trackCount: 1
          })
        ])
      })
    );

    const albumResponse = await apiRequest(`/api/album/${encodeURIComponent(unknownAlbumId)}`, {
      headers: {
        Cookie: cookie
      }
    });

    expect(albumResponse.status).toBe(200);
    expect(albumResponse.payload).toEqual(
      expect.objectContaining({
        album: expect.objectContaining({
          id: unknownAlbumId,
          name: unknownAlbumName,
          trackCount: 1
        }),
        tracks: [expect.objectContaining({ id: unknownTrack.id })]
      })
    );
  });
});
