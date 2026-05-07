import path from "node:path";

import { getTrackArtistName } from "../../services/library/libraryMediaResolver";
import type { Track } from "../../types/library";
import { resolveDataRelativePath } from "../../utils/paths";
import { mapTrackResponse } from "../trackPipeline";

export function collectAlbumArtists(tracks: Track[]): string | undefined {
  const artists = new Set<string>();
  for (const track of tracks) {
    const artistName = getTrackArtistName(track)?.trim();
    if (artistName) {
      artists.add(artistName);
    }
  }
  return artists.size > 0
    ? Array.from(artists).sort((a, b) => a.localeCompare(b)).join(", ")
    : undefined;
}

export function buildAlbumResponse(
  albumId: string,
  albumName: string | undefined,
  cover: string | undefined,
  tracks: Track[]
) {
  return {
    album: {
      id: albumId,
      name: albumName,
      artist: collectAlbumArtists(tracks),
      cover,
      trackCount: tracks.length
    },
    tracks: tracks.map(mapTrackResponse)
  };
}

export function getTrackArtistDirectorySegment(track: Track): string | undefined {
  try {
    const trackAbsolutePath = resolveDataRelativePath(track.path);
    const albumDir = path.dirname(trackAbsolutePath);
    const artistDir = path.dirname(albumDir);
    const segment = path.basename(artistDir).trim().toLowerCase();
    return segment || undefined;
  } catch {
    return undefined;
  }
}
