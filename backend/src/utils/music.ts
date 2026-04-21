import type { Track } from "../types/library";

export const ARTIST_METADATA_FILE = "artist.json";
export const ALBUM_METADATA_FILE = "album.json";
export const UNKNOWN_ARTIST = "Unknown Artist";
export const UNKNOWN_ALBUM = "Unknown Album";

const ARTIST_SEPARATOR_PATTERN = /\s*;\s*|\s+feat\.\s+|\s+ft\.\s+/i;

export function extractPrimaryArtist(name: string): string {
  const primary = name.split(ARTIST_SEPARATOR_PATTERN)[0]?.trim();
  return primary || name;
}

export function getTrackArtist(track: Track): string {
  const raw = track.tags.artist ?? track.tags.albumArtist ?? track.tags.artists?.[0] ?? "";
  return extractPrimaryArtist(raw);
}

export function getTrackArtistName(track: Track): string | undefined {
  const raw = track.tags.artist ?? track.tags.albumArtist ?? track.tags.artists?.[0];
  return raw ? extractPrimaryArtist(raw) : undefined;
}

export function getTrackAlbum(track: Track): string {
  return track.tags.album ?? "";
}

export function getTrackTitle(track: Track): string {
  return track.tags.title ?? track.path;
}

export function normalizeIndexKey(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

const LEADING_THE_PATTERN = /^the\s+/i;

export function getArtistSortKey(value?: string): string {
  const trimmed = (value ?? "").trim();
  return trimmed.replace(LEADING_THE_PATTERN, "");
}
