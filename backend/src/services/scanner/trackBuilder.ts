import type { Track } from "../../types/library";
import { getAudioMimeType } from "../../utils/mime";
import { getTrackArtist, getTrackAlbum, getTrackTitle, UNKNOWN_ALBUM } from "../../utils/music";
import { extractAudioMetadata } from "./audioProbe";
import { ensureTrackCover } from "../storage/coverService";
import {
  type AlbumAggregate,
  addTrackToAlbumAggregate,
  ensureTrackMediaMetadata
} from "./scannerMedia";
import type { FileSystemTrackState } from "./scannerState";
import type { ClassifiedTracks } from "./changeDetector";

export function applyTrackMetadataOverride(
  track: Track,
  metadataOverride?: { title?: string; artist?: string; album?: string; year?: number; genre?: string[] }
): Track {
  if (!metadataOverride) {
    return track;
  }

  return {
    ...track,
    tags: {
      ...track.tags,
      title: metadataOverride.title ?? track.tags.title,
      artist: metadataOverride.artist ?? track.tags.artist,
      album: metadataOverride.album ?? track.tags.album,
      year: metadataOverride.year ?? track.tags.year,
      genre: metadataOverride.genre ?? track.tags.genre
    }
  };
}

export async function probeChangedTracks(
  changedTracks: FileSystemTrackState[],
  metadataOverrides: Record<string, { title?: string; artist?: string; album?: string; year?: number; genre?: string[] }>,
  albumsByDirectory: Map<string, AlbumAggregate>,
  processedArtists: Set<string>,
  processedAlbums: Set<string>
): Promise<Track[]> {
  const tracks: Track[] = [];

  for (const state of changedTracks) {
    const metadata = await extractAudioMetadata(state.filePath);
    const metadataOverride = metadataOverrides[state.trackId];
    const cover = await ensureTrackCover(state.trackId, metadata.cover);
    const tags = {
      ...metadata.tags,
      title: metadataOverride?.title ?? metadata.tags.title,
      artist: metadataOverride?.artist ?? metadata.tags.artist,
      album: metadataOverride?.album ?? metadata.tags.album,
      genre: metadataOverride?.genre ?? metadata.tags.genre
    };

    const track: Track = {
      id: state.trackId,
      owner: state.ownerId,
      path: state.relativePath,
      duration: metadata.duration,
      mimeType: getAudioMimeType(state.filePath),
      codec: metadata.codec,
      bitrate: metadata.bitrate,
      sampleRate: metadata.sampleRate,
      tags,
      cover,
      addedAt: new Date().toISOString()
    };

    await ensureTrackMediaMetadata(track, metadata.cover, processedArtists, processedAlbums);
    await addTrackToAlbumAggregate(track, state.filePath, tags.album ?? UNKNOWN_ALBUM, albumsByDirectory);
    tracks.push(track);
  }

  return tracks;
}

export function compareTrackOrder(a: Track, b: Track): number {
  const byArtist = getTrackArtist(a).localeCompare(getTrackArtist(b));
  if (byArtist !== 0) {
    return byArtist;
  }

  const byAlbum = getTrackAlbum(a).localeCompare(getTrackAlbum(b));
  if (byAlbum !== 0) {
    return byAlbum;
  }

  return getTrackTitle(a).localeCompare(getTrackTitle(b));
}

export async function mergeFinalTracks(
  unchangedTracks: ClassifiedTracks["unchanged"],
  changedTracks: Track[],
  metadataOverrides: Record<string, { title?: string; artist?: string; album?: string; year?: number; genre?: string[] }>,
  albumsByDirectory: Map<string, AlbumAggregate>,
  processedArtists: Set<string>,
  processedAlbums: Set<string>
): Promise<Track[]> {
  const mergedTracks: Track[] = [];

  for (const unchanged of unchangedTracks) {
    const withOverrides = applyTrackMetadataOverride(
      unchanged.track,
      metadataOverrides[unchanged.state.trackId]
    );
    await ensureTrackMediaMetadata(withOverrides, undefined, processedArtists, processedAlbums);
    await addTrackToAlbumAggregate(
      withOverrides,
      unchanged.state.filePath,
      withOverrides.tags.album ?? UNKNOWN_ALBUM,
      albumsByDirectory
    );
    mergedTracks.push(withOverrides);
  }

  mergedTracks.push(...changedTracks);
  mergedTracks.sort(compareTrackOrder);
  return mergedTracks;
}
