import type { AlbumEntry, ArtistEntry, LibraryResponse, Track } from "../types";
import { requestJson } from "./client";

export async function getLibrary(filters: {
  owner?: string;
  artist?: string;
  album?: string;
  q?: string;
}): Promise<LibraryResponse> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (!value) {
      continue;
    }
    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  const path = query ? `/api/library?${query}` : "/api/library";

  return requestJson<LibraryResponse>(path);
}

export type TracksResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  sortBy: string;
  sortDir: string;
  tracks: Track[];
};

export type RecentUploadAlbum = {
  albumName: string;
  artist: string;
  owner: string;
  trackCount: number;
  coverTrackId: string;
  tracks: Track[];
};

export type RecentUploadItem =
  | { kind: "track"; track: Track }
  | { kind: "album"; album: RecentUploadAlbum };

export async function getRecentUploads(params: {
  addedAfter: string;
  limit?: number;
  owner?: string;
}): Promise<RecentUploadItem[]> {
  const searchParams = new URLSearchParams();
  searchParams.set("addedAfter", params.addedAfter);
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.owner) searchParams.set("owner", params.owner);
  const payload = await requestJson<{ items?: RecentUploadItem[] }>(`/api/recent-uploads?${searchParams.toString()}`);
  return payload.items ?? [];
}

export async function getTracks(params: {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  addedAfter?: string;
  owner?: string;
  artist?: string;
  album?: string;
  q?: string;
}): Promise<TracksResponse> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  const path = query ? `/api/tracks?${query}` : "/api/tracks";

  return requestJson<TracksResponse>(path);
}

export async function getArtists(filters: {
  owner?: string;
  q?: string;
}): Promise<ArtistEntry[]> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (!value) {
      continue;
    }
    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  const path = query ? `/api/artists?${query}` : "/api/artists";
  const payload = await requestJson<{ artists: ArtistEntry[] }>(path);
  return payload.artists;
}

export async function getAlbums(filters: {
  owner?: string;
  artist?: string;
  q?: string;
}): Promise<AlbumEntry[]> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (!value) {
      continue;
    }
    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  const path = query ? `/api/albums?${query}` : "/api/albums";
  const payload = await requestJson<{ albums: AlbumEntry[] }>(path);
  return payload.albums;
}

export async function getArtistAlbums(
  artist: string,
  filters: {
    owner?: string;
    q?: string;
  }
): Promise<AlbumEntry[]> {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (!value) {
      continue;
    }
    searchParams.set(key, value);
  }

  const query = searchParams.toString();
  const encodedArtist = encodeURIComponent(artist.trim());
  const path = query ? `/api/artists/${encodedArtist}/albums?${query}` : `/api/artists/${encodedArtist}/albums`;
  const payload = await requestJson<{ albums: AlbumEntry[] }>(path);
  return payload.albums;
}

export async function getAlbumTracks(albumId: string): Promise<Track[]> {
  const payload = await requestJson<{ tracks: Track[] }>(`/api/album/${encodeURIComponent(albumId)}`);
  return payload.tracks;
}
