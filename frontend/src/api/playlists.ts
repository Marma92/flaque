import type {
  AutoPlaylistDetail,
  AutoPlaylistSummary,
  ForYouPlaylistDetail,
  ForYouPlaylistSummary,
  PersonalPlaylistDetail,
  PersonalPlaylistSummary,
  Playlist,
  PlaylistVisibility,
  Track
} from "../types";
import { requestJson, withApiBase } from "./client";

export async function createPlaylist(input: {
  name: string;
  visibility: PlaylistVisibility;
  description?: string;
}): Promise<Playlist> {
  const payload = await requestJson<{ playlist: Playlist }>("/api/playlists", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  return payload.playlist;
}

export async function patchPlaylist(
  playlistId: string,
  patch: {
    name?: string;
    visibility?: PlaylistVisibility;
    trackIds?: string[];
    description?: string;
    collaborators?: string[];
  }
): Promise<Playlist> {
  const payload = await requestJson<{ playlist: Playlist }>(`/api/playlists/${encodeURIComponent(playlistId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  });

  return payload.playlist;
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await requestJson(`/api/playlists/${encodeURIComponent(playlistId)}`, {
    method: "DELETE",
    skipJson: true
  });
}

export async function heartPlaylist(playlistId: string): Promise<{ hearted: boolean; heartCount: number }> {
  return requestJson<{ hearted: boolean; heartCount: number }>(
    `/api/playlists/${encodeURIComponent(playlistId)}/heart`,
    { method: "POST" }
  );
}

export async function reportPlaylistListen(playlistId: string): Promise<void> {
  await requestJson(`/api/playlists/${encodeURIComponent(playlistId)}/listen`, {
    method: "POST"
  }).catch(() => {});
}

export function playlistCoverUrl(playlistId: string): string {
  return withApiBase(`/api/playlists/${encodeURIComponent(playlistId)}/cover`);
}

export async function uploadPlaylistCover(playlistId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("cover", file);
  await requestJson<{ ok: boolean }>(`/api/playlists/${encodeURIComponent(playlistId)}/cover`, {
    method: "POST",
    body: formData
  });
}

export async function deletePlaylistCover(playlistId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/playlists/${encodeURIComponent(playlistId)}/cover`, {
    method: "DELETE"
  });
}

export async function getAutoPlaylists(): Promise<AutoPlaylistSummary[]> {
  const payload = await requestJson<{ playlists: AutoPlaylistSummary[] }>("/api/playlists/automatic");
  return payload.playlists;
}

export async function getAutoPlaylistDetail(id: string): Promise<{ playlist: AutoPlaylistDetail; tracks: Track[] }> {
  return requestJson<{ playlist: AutoPlaylistDetail; tracks: Track[] }>(
    `/api/playlists/automatic/${encodeURIComponent(id)}`
  );
}

export async function regenerateAutoPlaylists(): Promise<{ regenerated: number }> {
  return requestJson<{ regenerated: number }>("/api/playlists/automatic/regenerate", {
    method: "POST"
  });
}

export async function getForYouPlaylists(): Promise<ForYouPlaylistSummary[]> {
  const payload = await requestJson<{ playlists: ForYouPlaylistSummary[] }>("/api/playlists/for-you");
  return payload.playlists;
}

export async function getForYouPlaylistDetail(id: string): Promise<{ playlist: ForYouPlaylistDetail; tracks: Track[] }> {
  return requestJson<{ playlist: ForYouPlaylistDetail; tracks: Track[] }>(
    `/api/playlists/for-you/${encodeURIComponent(id)}`
  );
}

export async function dismissForYouPlaylist(playlistId: string): Promise<void> {
  await requestJson<void>(
    `/api/playlists/for-you/${encodeURIComponent(playlistId)}/dismiss`,
    { method: "POST", skipJson: true }
  );
}

export async function regenerateForYouPlaylists(): Promise<{ regenerated: number }> {
  return requestJson<{ regenerated: number }>("/api/playlists/for-you/regenerate", {
    method: "POST"
  });
}

export async function getPersonalPlaylists(): Promise<PersonalPlaylistSummary[]> {
  const payload = await requestJson<{ playlists: PersonalPlaylistSummary[] }>("/api/playlists/personal");
  return payload.playlists;
}

export async function getPersonalPlaylistDetail(
  id: string
): Promise<{ playlist: PersonalPlaylistDetail; tracks: Track[] }> {
  return requestJson<{ playlist: PersonalPlaylistDetail; tracks: Track[] }>(
    `/api/playlists/personal/${encodeURIComponent(id)}`
  );
}

export async function regeneratePersonalPlaylists(): Promise<{ regenerated: number }> {
  return requestJson<{ regenerated: number }>("/api/playlists/personal/regenerate", {
    method: "POST"
  });
}

export type AutoPlaylistConfig = {
  maxPlaylists: number;
  minTracksPerPlaylist: number;
  tracksPerPlaylist: number;
};

export async function getAutoPlaylistConfig(): Promise<AutoPlaylistConfig> {
  return requestJson<AutoPlaylistConfig>("/api/playlists/automatic/config");
}

export async function patchAutoPlaylistConfig(patch: Partial<AutoPlaylistConfig>): Promise<AutoPlaylistConfig> {
  return requestJson<AutoPlaylistConfig>("/api/playlists/automatic/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
}
