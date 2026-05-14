import type { AlbumEntry } from "../types";
import { getArtistSortKey } from "./tracks";

export type AlbumSortMode =
  | "album-asc"
  | "album-desc"
  | "artist-asc"
  | "artist-desc"
  | "year-desc"
  | "year-asc";

export const DEFAULT_ALBUM_SORT_MODE: AlbumSortMode = "album-asc";

const ALBUM_SORT_MODES: ReadonlyArray<AlbumSortMode> = [
  "album-asc",
  "album-desc",
  "artist-asc",
  "artist-desc",
  "year-desc",
  "year-asc"
];

export function isAlbumSortMode(value: unknown): value is AlbumSortMode {
  return typeof value === "string" && (ALBUM_SORT_MODES as readonly string[]).includes(value);
}

export type AlbumGroup = {
  key: string;
  label: string;
  albums: AlbumEntry[];
};

const UNKNOWN_YEAR_KEY = "unknown-year";
const NON_ALPHA_KEY = "#";

function firstLetterBucket(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return NON_ALPHA_KEY;
  const first = trimmed[0]?.toUpperCase() ?? NON_ALPHA_KEY;
  return /[A-Z]/.test(first) ? first : NON_ALPHA_KEY;
}

function albumNameKey(album: AlbumEntry): string {
  return album.name;
}

function albumArtistKey(album: AlbumEntry): string {
  return getArtistSortKey(album.artist ?? "");
}

function compareLetterBuckets(a: string, b: string, descending: boolean): number {
  if (a === NON_ALPHA_KEY && b !== NON_ALPHA_KEY) return 1;
  if (a !== NON_ALPHA_KEY && b === NON_ALPHA_KEY) return -1;
  const cmp = a.localeCompare(b);
  return descending ? -cmp : cmp;
}

function compareStrings(a: string, b: string, descending: boolean): number {
  const cmp = a.trim().toLowerCase().localeCompare(b.trim().toLowerCase());
  return descending ? -cmp : cmp;
}

function hasYear(album: AlbumEntry): album is AlbumEntry & { year: number } {
  return typeof album.year === "number" && Number.isFinite(album.year);
}

export function sortAlbums(albums: readonly AlbumEntry[], mode: AlbumSortMode): AlbumEntry[] {
  switch (mode) {
    case "album-asc":
    case "album-desc": {
      const descending = mode === "album-desc";
      return [...albums].sort((a, b) => {
        const bucketCmp = compareLetterBuckets(
          firstLetterBucket(albumNameKey(a)),
          firstLetterBucket(albumNameKey(b)),
          descending
        );
        if (bucketCmp !== 0) return bucketCmp;
        return compareStrings(albumNameKey(a), albumNameKey(b), descending);
      });
    }
    case "artist-asc":
    case "artist-desc": {
      const descending = mode === "artist-desc";
      return [...albums].sort((a, b) => {
        const bucketCmp = compareLetterBuckets(
          firstLetterBucket(albumArtistKey(a)),
          firstLetterBucket(albumArtistKey(b)),
          descending
        );
        if (bucketCmp !== 0) return bucketCmp;
        const artistCmp = compareStrings(albumArtistKey(a), albumArtistKey(b), descending);
        if (artistCmp !== 0) return artistCmp;
        // Stable secondary order: album name ascending regardless of direction
        return compareStrings(albumNameKey(a), albumNameKey(b), false);
      });
    }
    case "year-desc":
    case "year-asc": {
      const descending = mode === "year-desc";
      return [...albums].sort((a, b) => {
        const aHas = hasYear(a);
        const bHas = hasYear(b);
        if (!aHas && !bHas) return compareStrings(albumNameKey(a), albumNameKey(b), false);
        if (!aHas) return 1;
        if (!bHas) return -1;
        const cmp = a.year - b.year;
        if (cmp !== 0) return descending ? -cmp : cmp;
        return compareStrings(albumNameKey(a), albumNameKey(b), false);
      });
    }
  }
}

export function groupSortedAlbums(
  sortedAlbums: readonly AlbumEntry[],
  mode: AlbumSortMode
): AlbumGroup[] {
  const groups: AlbumGroup[] = [];
  let current: AlbumGroup | null = null;

  const bucketFor = (album: AlbumEntry): { key: string; label: string } => {
    switch (mode) {
      case "album-asc":
      case "album-desc": {
        const bucket = firstLetterBucket(albumNameKey(album));
        return { key: bucket, label: bucket };
      }
      case "artist-asc":
      case "artist-desc": {
        const bucket = firstLetterBucket(albumArtistKey(album));
        return { key: bucket, label: bucket };
      }
      case "year-desc":
      case "year-asc": {
        if (!hasYear(album)) return { key: UNKNOWN_YEAR_KEY, label: "Unknown" };
        const year = String(Math.trunc(album.year));
        return { key: year, label: year };
      }
    }
  };

  for (const album of sortedAlbums) {
    const { key, label } = bucketFor(album);
    if (!current || current.key !== key) {
      current = { key, label, albums: [] };
      groups.push(current);
    }
    current.albums.push(album);
  }

  return groups;
}

export function sortAndGroupAlbums(
  albums: readonly AlbumEntry[],
  mode: AlbumSortMode
): AlbumGroup[] {
  return groupSortedAlbums(sortAlbums(albums, mode), mode);
}
