import type { Track } from "../types/library";

export const ARTIST_METADATA_FILE = "artist.json";
export const ALBUM_METADATA_FILE = "album.json";
export const UNKNOWN_ARTIST = "Unknown Artist";
export const UNKNOWN_ALBUM = "Unknown Album";

export function getTrackArtist(track: Track): string {
  return track.tags.artist ?? track.tags.albumArtist ?? track.tags.artists?.[0] ?? "";
}

export function getTrackArtistName(track: Track): string | undefined {
  return track.tags.artist ?? track.tags.albumArtist ?? track.tags.artists?.[0];
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
