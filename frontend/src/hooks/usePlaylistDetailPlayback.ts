import { useCallback } from "react";

import type { Playlist, Track } from "../types";

type UsePlaylistDetailPlaybackArgs = {
  playlist: Playlist | null;
  tracks: Track[];
  onPlay: (playlist: Playlist, options?: { shuffle?: boolean }) => void;
  onPlayTrack?: (track: Track, queueSource: Track[]) => void;
};

type UsePlaylistDetailPlaybackResult = {
  handlePlayAll: () => void;
  handleShufflePlay: () => void;
  handlePlayFromTrack: (track: Track) => void;
};

/**
 * Shared play / shuffle / play-from-track handlers for playlist detail views.
 * Works with both real playlists (PlaylistDetailView) and synthetic ones
 * (Auto / For-You) by accepting a Playlist-shaped meta object.
 */
export function usePlaylistDetailPlayback({
  playlist,
  tracks,
  onPlay,
  onPlayTrack
}: UsePlaylistDetailPlaybackArgs): UsePlaylistDetailPlaybackResult {
  const handlePlayAll = useCallback((): void => {
    if (!playlist) return;
    onPlay(playlist);
  }, [playlist, onPlay]);

  const handleShufflePlay = useCallback((): void => {
    if (!playlist) return;
    onPlay(playlist, { shuffle: true });
  }, [playlist, onPlay]);

  const handlePlayFromTrack = useCallback((track: Track): void => {
    if (!playlist) return;
    if (onPlayTrack) {
      onPlayTrack(track, tracks);
      return;
    }
    const idx = tracks.indexOf(track);
    if (idx < 0) return;
    const reordered = [...tracks.slice(idx), ...tracks.slice(0, idx)];
    onPlay({ ...playlist, trackIds: reordered.map((t) => t.id) });
  }, [playlist, tracks, onPlay, onPlayTrack]);

  return { handlePlayAll, handleShufflePlay, handlePlayFromTrack };
}
