import type { Track } from "../types";

export function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const name = normalized.split("/").filter(Boolean).pop();
  return name ?? filePath;
}

export function getTrackDisplayTitle(track: Pick<Track, "path" | "tags">): string {
  const title = track.tags.title?.trim();
  if (title) {
    return title;
  }

  return fileNameFromPath(track.path);
}

function normalizeTagText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function extractYearFromDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/(?:^|\D)(\d{4})(?:\D|$)/);
  return match?.[1];
}

export function getTrackDisplayArtist(track: Pick<Track, "tags">): string | undefined {
  const directArtist = normalizeTagText(track.tags.artist);
  if (directArtist) {
    return directArtist;
  }

  const albumArtist = normalizeTagText(track.tags.albumArtist);
  if (albumArtist) {
    return albumArtist;
  }

  if (Array.isArray(track.tags.artists)) {
    const firstArtist = track.tags.artists
      .map((artist) => normalizeTagText(artist))
      .find((artist): artist is string => Boolean(artist));

    if (firstArtist) {
      return firstArtist;
    }
  }

  return undefined;
}

export function getTrackDisplayAlbum(track: Pick<Track, "tags">): string | undefined {
  return normalizeTagText(track.tags.album);
}

export function getTrackDisplayYear(track: Pick<Track, "tags">): string | undefined {
  if (typeof track.tags.year === "number" && Number.isFinite(track.tags.year)) {
    return String(Math.trunc(track.tags.year));
  }

  return extractYearFromDate(track.tags.date) ?? extractYearFromDate(track.tags.originalDate);
}

export function getTrackDisplayAlbumWithYear(track: Pick<Track, "tags">): string | undefined {
  const album = getTrackDisplayAlbum(track);
  if (!album) {
    return undefined;
  }

  const year = getTrackDisplayYear(track);
  return year ? `${album} (${year})` : album;
}
