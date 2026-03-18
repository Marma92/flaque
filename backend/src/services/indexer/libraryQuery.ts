import type { Track } from "../../types/library";

export type LibraryFilter = {
  owner?: string;
  artist?: string;
  album?: string;
  q?: string;
};

export type ArtistEntry = {
  name: string;
  trackCount: number;
};

export type AlbumEntry = {
  name: string;
  artist?: string;
  trackCount: number;
};

export type AdjacentDirection = "next" | "previous";

export type TrackSortBy =
  | "title"
  | "artist"
  | "album"
  | "owner"
  | "duration"
  | "codec"
  | "bitrate"
  | "sampleRate"
  | "path";

export type TrackSortDirection = "asc" | "desc";

function normalize(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

export function filterTracks(tracks: Track[], filter: LibraryFilter): Track[] {
  const owner = normalize(filter.owner);
  const artist = normalize(filter.artist);
  const album = normalize(filter.album);
  const q = normalize(filter.q);

  if (!owner && !artist && !album && !q) {
    return tracks;
  }

  return tracks.filter((track) => {
    if (owner && normalize(track.owner) !== owner) {
      return false;
    }

    if (artist && normalize(track.tags.artist) !== artist) {
      return false;
    }

    if (album && normalize(track.tags.album) !== album) {
      return false;
    }

    if (!q) {
      return true;
    }

    const searchable = [
      track.tags.title,
      track.tags.artist,
      track.tags.album,
      track.owner,
      track.path,
      track.codec
    ]
      .map((item) => normalize(item))
      .join(" ");

    return searchable.includes(q);
  });
}

export function listOwners(tracks: Track[]): string[] {
  return Array.from(new Set(tracks.map((track) => track.owner))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function listArtists(tracks: Track[]): ArtistEntry[] {
  const map = new Map<string, number>();

  for (const track of tracks) {
    const name = track.tags.artist?.trim();
    if (!name) {
      continue;
    }
    map.set(name, (map.get(name) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([name, trackCount]) => ({ name, trackCount }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listAlbums(tracks: Track[]): AlbumEntry[] {
  const map = new Map<string, AlbumEntry>();

  for (const track of tracks) {
    const album = track.tags.album?.trim();
    if (!album) {
      continue;
    }

    const artist = track.tags.artist?.trim();
    const key = `${artist ?? ""}::${album}`;
    const current = map.get(key);

    if (!current) {
      map.set(key, {
        name: album,
        artist,
        trackCount: 1
      });
      continue;
    }

    current.trackCount += 1;
  }

  return Array.from(map.values()).sort((a, b) => {
    const byArtist = (a.artist ?? "").localeCompare(b.artist ?? "");
    if (byArtist !== 0) {
      return byArtist;
    }
    return a.name.localeCompare(b.name);
  });
}

function toComparableString(value?: string): string {
  return normalize(value);
}

function toComparableNumber(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return -1;
  }
  return value;
}

function getSortValue(track: Track, sortBy: TrackSortBy): string | number {
  switch (sortBy) {
    case "title":
      return toComparableString(track.tags.title ?? track.path);
    case "artist":
      return toComparableString(track.tags.artist);
    case "album":
      return toComparableString(track.tags.album);
    case "owner":
      return toComparableString(track.owner);
    case "duration":
      return toComparableNumber(track.duration);
    case "codec":
      return toComparableString(track.codec);
    case "bitrate":
      return toComparableNumber(track.bitrate);
    case "sampleRate":
      return toComparableNumber(track.sampleRate);
    case "path":
      return toComparableString(track.path);
    default:
      return toComparableString(track.path);
  }
}

export function sortTracks(
  tracks: Track[],
  sortBy: TrackSortBy,
  direction: TrackSortDirection = "asc"
): Track[] {
  const factor = direction === "desc" ? -1 : 1;

  return [...tracks].sort((a, b) => {
    const aValue = getSortValue(a, sortBy);
    const bValue = getSortValue(b, sortBy);

    if (typeof aValue === "number" && typeof bValue === "number") {
      if (aValue === bValue) {
        return a.id.localeCompare(b.id) * factor;
      }
      return (aValue - bValue) * factor;
    }

    const stringComparison = String(aValue).localeCompare(String(bValue));
    if (stringComparison === 0) {
      return a.id.localeCompare(b.id) * factor;
    }

    return stringComparison * factor;
  });
}

export function paginateTracks(
  tracks: Track[],
  page: number,
  limit: number
): {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  tracks: Track[];
} {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 100;
  const total = tracks.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);
  const safePage = totalPages === 0 ? 1 : Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * safeLimit;

  return {
    total,
    page: safePage,
    limit: safeLimit,
    totalPages,
    tracks: tracks.slice(offset, offset + safeLimit)
  };
}

export function getAdjacentTrack(
  tracks: Track[],
  currentTrackId: string,
  direction: AdjacentDirection,
  wrap = true
): Track | null {
  if (tracks.length === 0) {
    return null;
  }

  const currentIndex = tracks.findIndex((track) => track.id === currentTrackId);
  if (currentIndex < 0) {
    return null;
  }

  const offset = direction === "next" ? 1 : -1;
  const targetIndex = currentIndex + offset;

  if (targetIndex >= 0 && targetIndex < tracks.length) {
    return tracks[targetIndex] ?? null;
  }

  if (!wrap) {
    return null;
  }

  if (direction === "next") {
    return tracks[0] ?? null;
  }

  return tracks[tracks.length - 1] ?? null;
}
