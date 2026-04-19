import { coverPathUrl, coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";

import type { AlbumEntry, ArtistEntry } from "../types";

export { defaultCoverImage };

/**
 * Resolve the best available cover image URL for an album.
 * Priority: album.cover → album.previewTrackId → default placeholder.
 */
export function getAlbumCoverSrc(album: AlbumEntry): string {
  if (album.cover) {
    return coverPathUrl(album.cover);
  }

  if (album.previewTrackId) {
    return coverUrl(album.previewTrackId);
  }

  return defaultCoverImage;
}

/**
 * Resolve the best available photo URL for an artist.
 * Priority: artist.photo → artist.previewTrackId → default placeholder.
 */
export function getArtistPhotoSrc(artist: ArtistEntry): string {
  if (artist.photo) {
    return coverPathUrl(artist.photo);
  }

  if (artist.previewTrackId) {
    return coverUrl(artist.previewTrackId);
  }

  return defaultCoverImage;
}
