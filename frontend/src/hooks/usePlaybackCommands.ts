import { useCallback, type Dispatch, type SetStateAction } from "react";

import { getAdjacentTrack } from "../api";
import type { AppNotice } from "../components/AppStatusBanners";
import type { Playlist, Track } from "../types";
import type { LibraryFilters } from "../types/library";
import { getAdjacentTrackInQueue } from "../utils/appUtils";

type UsePlaybackCommandsArgs = {
  selectedTrackRefreshed: Track | null;
  refreshedQueue: Track[];
  shuffleEnabled: boolean;
  allTracks: Track[];
  filters: LibraryFilters;
  allTracksById: Map<string, Track>;
  requestTrackPlayback: (track: Track, queueSource?: Track[]) => void;
  replayRecentTrack: (track: Track) => void;
  setSelectedTrack: Dispatch<SetStateAction<Track | null>>;
  setPlayerStatusMessage: Dispatch<SetStateAction<string | null>>;
  setLibraryError: Dispatch<SetStateAction<string | null>>;
  setAppNotice: Dispatch<SetStateAction<AppNotice | null>>;
};

type UsePlaybackCommandsResult = {
  requestTrackPlaybackWithStatus: (track: Track, queueSource?: Track[]) => void;
  handleReplayRecentTrack: (track: Track) => void;
  handlePlayPlaylist: (playlist: Playlist) => void;
  handleNavigateTrack: (direction: "next" | "previous", wrap?: boolean) => Promise<void>;
};

/**
 * Playback command handlers used by the player shell and playlist actions.
 */
export function usePlaybackCommands({
  selectedTrackRefreshed,
  refreshedQueue,
  shuffleEnabled,
  allTracks,
  filters,
  allTracksById,
  requestTrackPlayback,
  replayRecentTrack,
  setSelectedTrack,
  setPlayerStatusMessage,
  setLibraryError,
  setAppNotice
}: UsePlaybackCommandsArgs): UsePlaybackCommandsResult {
  const requestTrackPlaybackWithStatus = useCallback((track: Track, queueSource?: Track[]): void => {
    setPlayerStatusMessage(null);
    requestTrackPlayback(track, queueSource);
  }, [requestTrackPlayback, setPlayerStatusMessage]);

  const handleReplayRecentTrack = useCallback((track: Track): void => {
    setPlayerStatusMessage(null);
    replayRecentTrack(track);
  }, [replayRecentTrack, setPlayerStatusMessage]);

  const handlePlayPlaylist = useCallback((playlist: Playlist): void => {
    const playlistTracks = playlist.trackIds
      .map((trackId) => allTracksById.get(trackId))
      .filter((track): track is Track => Boolean(track));

    if (playlistTracks.length === 0) {
      setLibraryError("This playlist has no playable tracks in the current index.");
      return;
    }

    setLibraryError(null);
    requestTrackPlaybackWithStatus(playlistTracks[0], playlistTracks);
  }, [allTracksById, requestTrackPlaybackWithStatus, setLibraryError]);

  const handleNavigateTrack = useCallback(async (direction: "next" | "previous", wrap = true): Promise<void> => {
    const currentTrack = selectedTrackRefreshed;
    if (!currentTrack) {
      return;
    }

    setPlayerStatusMessage(null);

    if (shuffleEnabled && direction === "next") {
      const shufflePool = refreshedQueue.length > 0 ? refreshedQueue : allTracks;
      const shuffleCandidates = shufflePool.filter((track) => track.id !== currentTrack.id);

      if (shuffleCandidates.length > 0) {
        const randomIndex = Math.floor(Math.random() * shuffleCandidates.length);
        const randomTrack = shuffleCandidates[randomIndex] ?? null;
        if (randomTrack) {
          setSelectedTrack(randomTrack);
          return;
        }
      }

      if (!wrap) {
        setPlayerStatusMessage("Shuffle has no additional track in the current queue.");
      }
      return;
    }

    const nextTrackFromQueue = getAdjacentTrackInQueue(refreshedQueue, currentTrack.id, direction, wrap);
    if (nextTrackFromQueue && nextTrackFromQueue.id !== currentTrack.id) {
      setSelectedTrack(nextTrackFromQueue);
      return;
    }

    try {
      const adjacentTrack = await getAdjacentTrack({
        trackId: currentTrack.id,
        direction,
        wrap,
        owner: filters.owner,
        artist: filters.artist,
        album: filters.album,
        q: filters.q
      });

      if (!adjacentTrack || adjacentTrack.id === currentTrack.id) {
        if (!wrap) {
          setPlayerStatusMessage(
            direction === "next"
              ? "You reached the end of the current queue."
              : "You are already at the start of the current queue."
          );
        }
        return;
      }

      setSelectedTrack(adjacentTrack);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to navigate tracks";
      setPlayerStatusMessage("Unable to change track right now.");
      setLibraryError(message);
      setAppNotice({
        tone: "error",
        message
      });
    }
  }, [
    allTracks,
    filters.album,
    filters.artist,
    filters.owner,
    filters.q,
    refreshedQueue,
    selectedTrackRefreshed,
    setAppNotice,
    setLibraryError,
    setPlayerStatusMessage,
    setSelectedTrack,
    shuffleEnabled
  ]);

  return {
    requestTrackPlaybackWithStatus,
    handleReplayRecentTrack,
    handlePlayPlaylist,
    handleNavigateTrack
  };
}
