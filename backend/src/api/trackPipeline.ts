import { listUsers } from "../auth/db";
import { IndexStore } from "../services/indexer/indexStore";
import { filterTracks, type LibraryFilter } from "../services/indexer/libraryQuery";
import { normalizeIndexKey } from "../utils/music";
import type { Track } from "../types/library";

export function mapTrackResponse(track: Track): Track {
  return {
    ...track,
    cover: track.cover ?? `/api/covers/${track.id}`
  };
}

export function getOwnerNamesById(): Map<string, string> {
  return new Map(listUsers().map((user) => [user.id, user.username]));
}

function mapTrackOwner(track: Track, ownerNamesById: Map<string, string>): Track {
  const ownerName = ownerNamesById.get(track.owner);
  if (!ownerName || ownerName === track.owner) {
    return track;
  }

  return { ...track, owner: ownerName };
}

export function mapTrackOwners(tracks: Track[], ownerNamesById: Map<string, string>): Track[] {
  return tracks.map((track) => mapTrackOwner(track, ownerNamesById));
}

function intersectTracks(left: Track[], right: Track[]): Track[] {
  if (left.length === 0 || right.length === 0) {
    return [];
  }

  if (left.length > right.length) {
    return intersectTracks(right, left);
  }

  const rightById = new Set(right.map((track) => track.id));
  return left.filter((track) => rightById.has(track.id));
}

function collectTracksByOwnerFilter(
  indexStore: IndexStore,
  ownerFilter: string,
  ownerNamesById: Map<string, string>
): Track[] {
  const normalizedOwner = normalizeIndexKey(ownerFilter);
  const ownerIds = new Set<string>([ownerFilter]);

  for (const [ownerId, ownerName] of ownerNamesById) {
    if (
      normalizeIndexKey(ownerId) === normalizedOwner ||
      normalizeIndexKey(ownerName) === normalizedOwner
    ) {
      ownerIds.add(ownerId);
    }
  }

  const tracksById = new Map<string, Track>();
  for (const ownerId of ownerIds) {
    for (const track of indexStore.getTracksByOwner(ownerId)) {
      tracksById.set(track.id, track);
    }
  }

  return Array.from(tracksById.values());
}

export function selectIndexedTracks(
  indexStore: IndexStore,
  filter: Pick<LibraryFilter, "owner" | "artist" | "album">,
  ownerNamesById: Map<string, string>
): Track[] {
  let tracks: Track[] | null = null;

  if (filter.owner) {
    tracks = collectTracksByOwnerFilter(indexStore, filter.owner, ownerNamesById);
  }

  if (filter.artist) {
    const artistTracks = indexStore.getTracksByArtist(filter.artist);
    tracks = tracks ? intersectTracks(tracks, artistTracks) : artistTracks;
  }

  if (filter.album) {
    const albumTracks = indexStore.getTracksByAlbum(filter.album);
    tracks = tracks ? intersectTracks(tracks, albumTracks) : albumTracks;
  }

  return tracks ?? indexStore.getTracks();
}

export function applyMetadataPatchToTrack(
  track: Track,
  patch: {
    hasTitle: boolean;
    title?: string;
    hasArtist: boolean;
    artist?: string;
    hasAlbum: boolean;
    album?: string;
    hasYear: boolean;
    year?: number;
  }
): Track {
  return {
    ...track,
    tags: {
      ...track.tags,
      ...(patch.hasTitle ? { title: patch.title } : {}),
      ...(patch.hasArtist ? { artist: patch.artist } : {}),
      ...(patch.hasAlbum ? { album: patch.album } : {}),
      ...(patch.hasYear ? { year: patch.year } : {})
    }
  };
}

/**
 * Run the full filtering pipeline: index lookup -> owner name mapping -> text filter -> response mapping.
 */
export function resolveFilteredTracks(
  indexStore: IndexStore,
  filter: LibraryFilter,
  ownerNamesById: Map<string, string>
): Track[] {
  const indexedTracks = selectIndexedTracks(indexStore, filter, ownerNamesById);
  const tracksWithOwnerNames = mapTrackOwners(indexedTracks, ownerNamesById);
  return filterTracks(tracksWithOwnerNames, filter);
}
