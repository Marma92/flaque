import type { AutoPlaylistSummary, ForYouPlaylistSummary, Playlist, PlaylistVisibility, Track, User } from "../types";
import { AutoPlaylistDetailView } from "./AutoPlaylistDetailView";
import { ForYouPlaylistDetailView } from "./ForYouPlaylistDetailView";
import { LibraryPlaylistSection } from "./LibraryPlaylistSection";
import { PlaylistDetailView } from "./PlaylistDetailView";

export type PlaylistsSectionProps = {
  playlistDetailId: string | null;
  onPlaylistDetailNavigate: (id: string | null) => void;
  availablePlaylists: Playlist[];
  manageablePlaylists: Playlist[];
  ownerNameById: Record<string, string>;
  allTracksById: Map<string, Track>;
  user: User;
  onCreatePlaylist: (input: { name: string; visibility: PlaylistVisibility; description?: string }) => Promise<void>;
  onPlayPlaylist: (playlist: Playlist) => void;
  onPatchPlaylist: (playlistId: string, patch: { name?: string; visibility?: PlaylistVisibility; trackIds?: string[]; description?: string; collaborators?: string[] }) => Promise<Playlist>;
  onDeletePlaylist: (playlistId: string) => Promise<void>;
  onHeartPlaylist: (playlistId: string) => Promise<{ hearted: boolean; heartCount: number }>;
  onReportPlaylistListen: (playlistId: string) => Promise<void>;
  autoPlaylists: AutoPlaylistSummary[];
  loadingAutoPlaylists: boolean;
  forYouPlaylists: ForYouPlaylistSummary[];
  loadingForYouPlaylists: boolean;
  onDismissForYouPlaylist: (playlistId: string) => Promise<void>;
};

export function PlaylistsSection({
  playlistDetailId,
  onPlaylistDetailNavigate,
  availablePlaylists,
  manageablePlaylists,
  ownerNameById,
  allTracksById,
  user,
  onCreatePlaylist,
  onPlayPlaylist,
  onPatchPlaylist,
  onDeletePlaylist,
  onHeartPlaylist,
  onReportPlaylistListen,
  autoPlaylists,
  loadingAutoPlaylists,
  forYouPlaylists,
  loadingForYouPlaylists,
  onDismissForYouPlaylist
}: PlaylistsSectionProps): JSX.Element {
  if (playlistDetailId && playlistDetailId.startsWith("for-you:")) {
    return (
      <ForYouPlaylistDetailView
        playlistId={playlistDetailId}
        allTracksById={allTracksById}
        onBack={() => onPlaylistDetailNavigate(null)}
        onPlayTrack={onPlayPlaylist}
        onDismiss={onDismissForYouPlaylist}
      />
    );
  }

  if (playlistDetailId && playlistDetailId.startsWith("auto:")) {
    return (
      <AutoPlaylistDetailView
        playlistId={playlistDetailId}
        allTracksById={allTracksById}
        onBack={() => onPlaylistDetailNavigate(null)}
        onPlayTrack={onPlayPlaylist}
      />
    );
  }

  if (playlistDetailId) {
    return (
      <PlaylistDetailView
        playlistId={playlistDetailId}
        availablePlaylists={availablePlaylists}
        manageablePlaylists={manageablePlaylists}
        allTracksById={allTracksById}
        ownerNameById={ownerNameById}
        user={user}
        onBack={() => onPlaylistDetailNavigate(null)}
        onPlay={onPlayPlaylist}
        onPatch={onPatchPlaylist}
        onNavigate={onPlaylistDetailNavigate}
        onDelete={onDeletePlaylist}
        onHeart={onHeartPlaylist}
        onReportListen={onReportPlaylistListen}
      />
    );
  }

  return (
    <LibraryPlaylistSection
      availablePlaylists={availablePlaylists}
      manageablePlaylists={manageablePlaylists}
      ownerNameById={ownerNameById}
      allTracksById={allTracksById}
      user={user}
      onCreatePlaylist={onCreatePlaylist}
      onPlayPlaylist={onPlayPlaylist}
      onPatchPlaylist={onPatchPlaylist}
      onDeletePlaylist={onDeletePlaylist}
      onNavigateToPlaylist={onPlaylistDetailNavigate}
      onHeartPlaylist={onHeartPlaylist}
      onReportPlaylistListen={onReportPlaylistListen}
      autoPlaylists={autoPlaylists}
      loadingAutoPlaylists={loadingAutoPlaylists}
      forYouPlaylists={forYouPlaylists}
      loadingForYouPlaylists={loadingForYouPlaylists}
      onDismissForYouPlaylist={onDismissForYouPlaylist}
    />
  );
}
