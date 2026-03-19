import type { LibraryIndex, Track } from "../../types/library";
import { readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { indexFilePath } from "../../utils/paths";
import { pruneTrackMetadataOverrides } from "./metadataOverrideStore";
import { scanFilesystemLibrary } from "../scanner/scannerService";
import { scanFilesystemPlaylists } from "../playlists/playlistStore";

const EMPTY_INDEX: LibraryIndex = {
  generatedAt: "",
  totalTracks: 0,
  tracks: [],
  playlists: []
};

function normalizeIndexKey(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function getTrackArtist(track: Track): string | undefined {
  return track.tags.artist ?? track.tags.albumArtist ?? track.tags.artists?.[0];
}

export class IndexStore {
  private snapshot: LibraryIndex = EMPTY_INDEX;

  private readonly tracksById = new Map<string, Track>();

  private readonly tracksByOwner = new Map<string, Track[]>();

  private readonly tracksByArtist = new Map<string, Track[]>();

  private readonly tracksByAlbum = new Map<string, Track[]>();

  private rebuildPromise: Promise<LibraryIndex> | null = null;

  private playlistsRefreshPromise: Promise<LibraryIndex> | null = null;

  async initialize(): Promise<void> {
    const loaded = await readJsonFile<LibraryIndex>(indexFilePath, EMPTY_INDEX);
    this.updateSnapshot(loaded);
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
    return [...(this.tracksByOwner.get(normalizeIndexKey(owner)) ?? [])];
  }

  getTracksByArtist(artist: string): Track[] {
    return [...(this.tracksByArtist.get(normalizeIndexKey(artist)) ?? [])];
  }

  getTracksByAlbum(album: string): Track[] {
    return [...(this.tracksByAlbum.get(normalizeIndexKey(album)) ?? [])];
  }

  async rebuild(): Promise<LibraryIndex> {
    if (this.rebuildPromise) {
      return this.rebuildPromise;
    }

    this.rebuildPromise = (async () => {
      const rebuilt = await scanFilesystemLibrary();
      await writeJsonAtomic(indexFilePath, rebuilt);
      await pruneTrackMetadataOverrides(rebuilt.tracks.map((track) => track.id));
      return this.updateSnapshot(rebuilt);
    })();

    try {
      return await this.rebuildPromise;
    } finally {
      this.rebuildPromise = null;
    }
  }

  async refreshPlaylists(): Promise<LibraryIndex> {
    if (this.rebuildPromise) {
      return this.rebuildPromise;
    }

    if (this.playlistsRefreshPromise) {
      return this.playlistsRefreshPromise;
    }

    this.playlistsRefreshPromise = (async () => {
      const playlists = await scanFilesystemPlaylists(this.snapshot.tracks);
      const nextSnapshot: LibraryIndex = {
        ...this.snapshot,
        generatedAt: new Date().toISOString(),
        playlists
      };

      await writeJsonAtomic(indexFilePath, nextSnapshot);
      return this.updateSnapshot(nextSnapshot);
    })();

    try {
      return await this.playlistsRefreshPromise;
    } finally {
      this.playlistsRefreshPromise = null;
    }
  }

  private normalizeIndex(index: LibraryIndex): LibraryIndex {
    if (!index || !Array.isArray(index.tracks)) {
      return EMPTY_INDEX;
    }

    return {
      generatedAt: index.generatedAt ?? "",
      totalTracks: index.totalTracks ?? index.tracks.length,
      tracks: index.tracks,
      playlists: Array.isArray(index.playlists) ? index.playlists : []
    };
  }

  private updateSnapshot(index: LibraryIndex): LibraryIndex {
    const normalized = this.normalizeIndex(index);
    this.snapshot = normalized;
    this.rebuildTrackIndexes(normalized.tracks);
    return normalized;
  }

  private rebuildTrackIndexes(tracks: Track[]): void {
    this.tracksById.clear();
    this.tracksByOwner.clear();
    this.tracksByArtist.clear();
    this.tracksByAlbum.clear();

    for (const track of tracks) {
      this.tracksById.set(track.id, track);
      this.pushTrack(this.tracksByOwner, track.owner, track);

      const artist = getTrackArtist(track);
      if (artist) {
        this.pushTrack(this.tracksByArtist, artist, track);
      }

      const album = track.tags.album;
      if (album) {
        this.pushTrack(this.tracksByAlbum, album, track);
      }
    }
  }

  private pushTrack(map: Map<string, Track[]>, key: string, track: Track): void {
    const normalizedKey = normalizeIndexKey(key);
    if (!normalizedKey) {
      return;
    }

    const bucket = map.get(normalizedKey);
    if (bucket) {
      bucket.push(track);
      return;
    }

    map.set(normalizedKey, [track]);
  }
}
