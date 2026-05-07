import type { Track, TrackMetadataPatch } from "../types";
import { requestJson, withApiBase } from "./client";

export async function getAdjacentTrack(input: {
  trackId: string;
  direction: "next" | "previous";
  wrap?: boolean;
  owner?: string;
  artist?: string;
  album?: string;
  q?: string;
}): Promise<Track | null> {
  const searchParams = new URLSearchParams();
  searchParams.set("direction", input.direction);

  if (input.wrap === false) {
    searchParams.set("wrap", "false");
  }

  for (const [key, value] of Object.entries({
    owner: input.owner,
    artist: input.artist,
    album: input.album,
    q: input.q
  })) {
    if (!value) {
      continue;
    }
    searchParams.set(key, value);
  }

  const payload = await requestJson<{ track: Track | null }>(
    `/api/tracks/${encodeURIComponent(input.trackId)}/adjacent?${searchParams.toString()}`
  );

  return payload.track;
}

export async function updateTrackMetadata(trackId: string, patch: TrackMetadataPatch): Promise<Track> {
  const payload = await requestJson<{ track: Track }>(`/api/tracks/${encodeURIComponent(trackId)}/metadata`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  });

  return payload.track;
}

export async function deleteTrackFile(trackId: string): Promise<{
  deletedTrackId: string;
  totalTracks: number;
}> {
  return requestJson<{ deletedTrackId: string; totalTracks: number }>(
    `/api/tracks/${encodeURIComponent(trackId)}`,
    {
      method: "DELETE"
    }
  );
}

export async function bulkDeleteTracks(trackIds: string[]): Promise<{
  deleted: string[];
  notFound: string[];
  totalTracks: number;
}> {
  return requestJson<{ deleted: string[]; notFound: string[]; totalTracks: number }>(
    "/api/tracks/bulk/delete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds })
    }
  );
}

export async function bulkUpdateTrackMetadata(
  trackIds: string[],
  patch: TrackMetadataPatch
): Promise<{ updated: string[]; notFound: string[] }> {
  return requestJson<{ updated: string[]; notFound: string[] }>(
    "/api/tracks/bulk/metadata",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds, ...patch })
    }
  );
}

export async function reportTrackPlay(trackId: string): Promise<void> {
  await fetch(withApiBase(`/api/tracks/${encodeURIComponent(trackId)}/play`), {
    method: "POST",
    credentials: "include"
  });
}

export async function reportTrackSkip(trackId: string): Promise<void> {
  await fetch(withApiBase(`/api/tracks/${encodeURIComponent(trackId)}/skip`), {
    method: "POST",
    credentials: "include"
  });
}
