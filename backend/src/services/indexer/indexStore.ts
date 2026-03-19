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

export class IndexStore {
  private snapshot: LibraryIndex = EMPTY_INDEX;

  private rebuildPromise: Promise<LibraryIndex> | null = null;

  private playlistsRefreshPromise: Promise<LibraryIndex> | null = null;

  async initialize(): Promise<void> {
    const loaded = await readJsonFile<LibraryIndex>(indexFilePath, EMPTY_INDEX);
    this.snapshot = this.normalizeIndex(loaded);
  }

  getSnapshot(): LibraryIndex {
    return this.snapshot;
  }

  getTrackById(trackId: string): Track | undefined {
    return this.snapshot.tracks.find((track) => track.id === trackId);
  }

  async rebuild(): Promise<LibraryIndex> {
    if (this.rebuildPromise) {
      return this.rebuildPromise;
    }

    this.rebuildPromise = (async () => {
      const rebuilt = await scanFilesystemLibrary();
      await writeJsonAtomic(indexFilePath, rebuilt);
      await pruneTrackMetadataOverrides(rebuilt.tracks.map((track) => track.id));
      this.snapshot = rebuilt;
      return rebuilt;
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
      this.snapshot = nextSnapshot;
      return nextSnapshot;
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
}
