import type { LibraryIndex, Playlist, Track } from "../../types/library";
import { fileExists, readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { createLogger } from "../../utils/logger";
import { normalizeIndexKey, getTrackArtistName } from "../../utils/music";
import { indexFilePath, playlistsIndexFilePath } from "../../utils/paths";

const log = createLogger("indexer");
import { pruneTrackMetadataOverrides } from "./metadataOverrideStore";
import { scanFilesystemLibrary } from "../scanner/scannerService";
import { scanFilesystemPlaylists } from "../playlists/playlistStore";

type PersistedLibraryIndex = Omit<LibraryIndex, "playlists"> & {
  playlists?: Playlist[];
};

type PlaylistsIndex = {
  playlists: Playlist[];
};

const EMPTY_INDEX: LibraryIndex = {
  generatedAt: "",
  totalTracks: 0,
  tracks: [],
  playlists: []
};

const EMPTY_PLAYLISTS_INDEX: PlaylistsIndex = {
  playlists: []
};

export class IndexStore {
  private snapshot: LibraryIndex = EMPTY_INDEX;

  private readonly tracksById = new Map<string, Track>();

  private readonly tracksByOwner = new Map<string, Track[]>();

  private readonly tracksByArtist = new Map<string, Track[]>();

  private readonly tracksByAlbum = new Map<string, Track[]>();

  private rebuildPromise: Promise<LibraryIndex> | null = null;

  private playlistsRefreshPromise: Promise<LibraryIndex> | null = null;

  async initialize(): Promise<void> {
    const loadedLibrary = await readJsonFile<PersistedLibraryIndex>(indexFilePath, EMPTY_INDEX);
    const normalizedLibrary = this.normalizeIndex(loadedLibrary);
    const hasPlaylistsIndex = await fileExists(playlistsIndexFilePath);
    const loadedPlaylists = hasPlaylistsIndex
      ? await readJsonFile<PlaylistsIndex>(playlistsIndexFilePath, EMPTY_PLAYLISTS_INDEX)
      : null;

    this.updateSnapshot({
      ...normalizedLibrary,
      playlists: hasPlaylistsIndex
        ? this.normalizePlaylistsIndex(loadedPlaylists).playlists
        : normalizedLibrary.playlists
    });
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

   getTracksById(trackIds: string[]): Map<string, Track> {
     const map = new Map<string, Track>();
     for (const id of trackIds) {
       const track = this.tracksById.get(id);
       if (track) {
         map.set(id, track);
       }
     }
     return map;
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
      const startTime = Date.now();
      log.info("Rebuilding library index");
      const rebuilt = await scanFilesystemLibrary({ previousIndex: this.snapshot });
      await writeJsonAtomic(indexFilePath, this.toPersistedLibraryIndex(rebuilt));
      await pruneTrackMetadataOverrides(rebuilt.tracks.map((track) => track.id));
      const result = this.updateSnapshot(rebuilt);
      log.info("Library index rebuilt", { tracks: rebuilt.totalTracks, durationMs: Date.now() - startTime });
      return result;
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

      await writeJsonAtomic(playlistsIndexFilePath, {
        playlists: nextSnapshot.playlists ?? []
      });
      return this.updateSnapshot(nextSnapshot);
    })();

    try {
      return await this.playlistsRefreshPromise;
    } finally {
      this.playlistsRefreshPromise = null;
    }
  }

  private normalizeIndex(index: PersistedLibraryIndex): LibraryIndex {
    if (!index || !Array.isArray(index.tracks)) {
      return EMPTY_INDEX;
    }

    const generatedAt = index.generatedAt ?? "";
    const fallbackAddedAt = generatedAt || new Date().toISOString();
    const tracks = index.tracks.map((track) =>
      track.addedAt ? track : { ...track, addedAt: fallbackAddedAt }
    );

    return {
      generatedAt,
      totalTracks: index.totalTracks ?? tracks.length,
      tracks,
      playlists: Array.isArray(index.playlists) ? index.playlists : []
    };
  }

  private normalizePlaylistsIndex(index: PlaylistsIndex | null): PlaylistsIndex {
    if (!index || !Array.isArray(index.playlists)) {
      return EMPTY_PLAYLISTS_INDEX;
    }

    return {
      playlists: index.playlists
    };
  }

  private toPersistedLibraryIndex(index: LibraryIndex): PersistedLibraryIndex {
    return {
      generatedAt: index.generatedAt,
      totalTracks: index.totalTracks,
      tracks: index.tracks
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

      const artist = getTrackArtistName(track);
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
