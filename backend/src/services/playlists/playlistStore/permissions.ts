import type { AuthUser } from "../../../types/auth";
import type { Playlist } from "../../../types/library";

export function canViewPlaylist(playlist: Playlist, user: AuthUser): boolean {
  return playlist.visibility === "public" || playlist.authorId === user.id || user.role === "admin";
}

export function canManagePlaylist(playlist: Playlist, user: AuthUser): boolean {
  return playlist.authorId === user.id || user.role === "admin";
}

export function canEditPlaylist(playlist: Playlist, user: AuthUser): boolean {
  return canManagePlaylist(playlist, user)
    || playlist.collaborators.includes(user.id)
    || playlist.collaborators.includes("everyone");
}

export function filterPlayablePlaylists(playlists: Playlist[], user: AuthUser): Playlist[] {
  return playlists.filter((playlist) => canViewPlaylist(playlist, user));
}
