import path from "node:path";

import { fileExists, readJsonFile } from "../../utils/fs";
import { ARTIST_METADATA_FILE, ALBUM_METADATA_FILE } from "../../utils/music";
import { resolveDataRelativePath } from "../../utils/paths";
import { listArtists } from "../indexer/libraryQuery";
import type { Track } from "../../types/library";

type ArtistMetadata = {
  name: string;
  photo?: {
    path: string;
  };
};

type AlbumMetadata = {
  id?: string;
  name: string;
  cover?: {
    path: string;
  };
  tracks?: Track[];
};

export type ResolvedAlbumMetadata = {
  albumDir: string;
  id?: string;
  name?: string;
  coverPath?: string;
};

import { getTrackArtistName } from "../../utils/music";
export { getTrackArtistName };

async function resolveArtistPhotoPath(
  track: Track,
  cache: Map<string, string | undefined>
): Promise<string | undefined> {
  try {
    const trackAbsolutePath = resolveDataRelativePath(track.path);
    const albumDir = path.dirname(trackAbsolutePath);
    const artistDir = path.dirname(albumDir);

    if (cache.has(artistDir)) {
      return cache.get(artistDir);
    }

    const metadataPath = path.join(artistDir, ARTIST_METADATA_FILE);
    const metadata = await readJsonFile<ArtistMetadata | null>(metadataPath, null);
    const photoPath = metadata?.photo?.path;

    if (!photoPath) {
      cache.set(artistDir, undefined);
      return undefined;
    }

    const absolutePhotoPath = resolveDataRelativePath(photoPath);
    const hasPhoto = await fileExists(absolutePhotoPath);
    const resolved = hasPhoto ? photoPath : undefined;
    cache.set(artistDir, resolved);
    return resolved;
  } catch {
    return undefined;
  }
}

export async function resolveAlbumMetadataForTrack(
  track: Track,
  cache: Map<string, ResolvedAlbumMetadata | undefined>
): Promise<ResolvedAlbumMetadata | undefined> {
  try {
    const trackAbsolutePath = resolveDataRelativePath(track.path);
    const albumDir = path.dirname(trackAbsolutePath);

    if (cache.has(albumDir)) {
      return cache.get(albumDir);
    }

    const metadataPath = path.join(albumDir, ALBUM_METADATA_FILE);
    const metadata = await readJsonFile<AlbumMetadata | null>(metadataPath, null);
    const coverPath = metadata?.cover?.path;
    let resolvedCoverPath: string | undefined;

    if (coverPath) {
      const absoluteCoverPath = resolveDataRelativePath(coverPath);
      const hasCover = await fileExists(absoluteCoverPath);
      resolvedCoverPath = hasCover ? coverPath : undefined;
    }

    const resolved: ResolvedAlbumMetadata = {
      albumDir,
      id: metadata?.id?.trim() ? metadata.id : undefined,
      name: metadata?.name?.trim() ? metadata.name : undefined,
      coverPath: resolvedCoverPath
    };

    cache.set(albumDir, resolved);
    return resolved;
  } catch {
    return undefined;
  }
}

export async function attachArtistPhotos(
  tracks: Track[]
): Promise<Array<{ name: string; trackCount: number; photo?: string; previewTrackId?: string }>> {
  const base = listArtists(tracks);
  const photoByArtist = new Map<string, string>();
  const previewTrackIdByArtist = new Map<string, string>();
  const cache = new Map<string, string | undefined>();

  for (const track of tracks) {
    const artistName = getTrackArtistName(track)?.trim();
    if (!artistName) {
      continue;
    }

    if (!previewTrackIdByArtist.has(artistName)) {
      previewTrackIdByArtist.set(artistName, track.id);
    }

    if (photoByArtist.has(artistName)) {
      continue;
    }

    const photoPath = await resolveArtistPhotoPath(track, cache);
    if (photoPath) {
      photoByArtist.set(artistName, photoPath);
    }
  }

  return base.map((artist) => ({
    ...artist,
    photo: photoByArtist.get(artist.name),
    previewTrackId: previewTrackIdByArtist.get(artist.name)
  }));
}

export function normalizeAlbumName(value?: string): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isCollaborativeAlbumTrack(track: Track): boolean {
  return Array.isArray(track.tags.artists) && track.tags.artists.length > 1;
}

function createCollaborativeAlbumId(albumName: string): string {
  return `collab:${normalizeAlbumName(albumName)}`;
}

export function parseCollaborativeAlbumId(
  albumId: string
): { normalizedAlbumName: string } | null {
  if (!albumId.startsWith("collab:")) {
    return null;
  }

  const normalizedAlbumName = albumId.slice("collab:".length).trim();
  if (!normalizedAlbumName) {
    return null;
  }

  return { normalizedAlbumName };
}

export async function attachCollaborativeAlbumCovers(
  tracks: Track[]
): Promise<
  Array<{
    id?: string;
    name: string;
    artist?: string;
    artists?: string[];
    trackCount: number;
    cover?: string;
    previewTrackId?: string;
  }>
> {
  const grouped = new Map<
    string,
    {
      id?: string;
      name: string;
      artists: Set<string>;
      trackCount: number;
      cover?: string;
      previewTrackId?: string;
    }
  >();

  const metadataCache = new Map<string, ResolvedAlbumMetadata | undefined>();

  for (const track of tracks) {
    const metadata = await resolveAlbumMetadataForTrack(track, metadataCache);
    const albumName = track.tags.album?.trim() ?? metadata?.name?.trim();
    if (!albumName) {
      continue;
    }

    const collaborative = Boolean(track.tags.album?.trim()) && isCollaborativeAlbumTrack(track);
    const albumKey = collaborative
      ? createCollaborativeAlbumId(albumName)
      : metadata?.id ?? (metadata?.albumDir ?? normalizeAlbumName(albumName));
    const current = grouped.get(albumKey);
    const artistName = getTrackArtistName(track)?.trim();
    const displayName = metadata?.name?.trim() ? metadata.name : albumName;

    if (!current) {
      grouped.set(albumKey, {
        id: collaborative ? albumKey : metadata?.id,
        name: displayName,
        artists: artistName ? new Set([artistName]) : new Set<string>(),
        trackCount: 1,
        cover: metadata?.coverPath,
        previewTrackId: track.id
      });
      continue;
    }

    current.trackCount += 1;
    if (artistName) {
      current.artists.add(artistName);
    }
    if (!current.cover && metadata?.coverPath) {
      current.cover = metadata.coverPath;
    }
    if (!current.previewTrackId) {
      current.previewTrackId = track.id;
    }
  }

  const entries: Array<{
    id?: string;
    name: string;
    artist?: string;
    artists?: string[];
    trackCount: number;
    cover?: string;
    previewTrackId?: string;
  }> = [];

  for (const groupedAlbum of grouped.values()) {
    const artists = Array.from(groupedAlbum.artists).sort((a, b) => a.localeCompare(b));

    entries.push({
      id: groupedAlbum.id,
      name: groupedAlbum.name,
      artist: artists.length > 0 ? artists.join(", ") : undefined,
      artists: artists.length > 0 ? artists : undefined,
      trackCount: groupedAlbum.trackCount,
      cover: groupedAlbum.cover,
      previewTrackId: groupedAlbum.previewTrackId
    });
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function compareAlbumTrackOrder(a: Track, b: Track): number {
  const aDisc = a.tags.discNumber ?? Number.MAX_SAFE_INTEGER;
  const bDisc = b.tags.discNumber ?? Number.MAX_SAFE_INTEGER;
  if (aDisc !== bDisc) {
    return aDisc - bDisc;
  }

  const aTrack = a.tags.trackNumber ?? Number.MAX_SAFE_INTEGER;
  const bTrack = b.tags.trackNumber ?? Number.MAX_SAFE_INTEGER;
  if (aTrack !== bTrack) {
    return aTrack - bTrack;
  }

  const aTitle = a.tags.title ?? a.path;
  const bTitle = b.tags.title ?? b.path;
  return aTitle.localeCompare(bTitle);
}
