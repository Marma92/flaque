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
