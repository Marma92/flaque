import type { IndexStore } from "../../services/indexer/indexStore";
import type { Playlist, PlaylistVisibility, Track } from "../../types/library";

export function normalizeVisibility(value: unknown): PlaylistVisibility | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "public" || value === "private") {
    return value;
  }
  return null;
}

export function parseTrackIds(value: unknown): string[] | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const trackIds: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }
    const normalized = item.trim();
    if (!normalized) {
      return null;
    }
    trackIds.push(normalized);
  }

  return trackIds;
}

export function parsePlaylistName(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  return normalized;
}

export function getTracksById(tracks: Track[]): Map<string, Track> {
  return new Map(tracks.map((track) => [track.id, track]));
}

export function mapPlaylistResponse(playlist: Playlist): Playlist & { trackCount: number } {
  return {
    ...playlist,
    trackCount: playlist.trackIds.length
  };
}

export function findPlaylistById(indexStore: IndexStore, playlistId: string): Playlist | undefined {
  const playlists = indexStore.getSnapshot().playlists ?? [];
  return playlists.find((playlist) => playlist.id === playlistId);
}
