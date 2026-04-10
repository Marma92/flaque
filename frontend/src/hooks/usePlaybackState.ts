import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import type { RepeatMode, TranscodeMode } from "../components/AudioPlayer";
import type { Track, User } from "../types";
import { isTrackLike, parseStoredQueueSnapshot, readShuffleMode, readTranscodeMode, type StoredQueueSnapshot } from "../utils/appUtils";

const RECENT_TRACKS_STORAGE_KEY = "flaque_recent_tracks_v1";
const TRANSCODE_MODE_STORAGE_KEY = "flaque_transcode_mode_v1";
const CURRENT_QUEUE_STORAGE_KEY = "flaque_current_queue_v1";
const SHUFFLE_MODE_STORAGE_KEY = "flaque_shuffle_mode_v1";
const MAX_RECENT_TRACKS = 24;

type UsePlaybackStateArgs = {
  user: User | null;
  allTracksById: Map<string, Track>;
  allTracks: Track[];
  loadingAllTracks: boolean;
};

type UsePlaybackStateResult = {
  selectedTrackRefreshed: Track | null;
  refreshedQueue: Track[];
  playRequestNonce: number;
  playRequestOffsetSec: number;
  transcodeMode: TranscodeMode;
  setTranscodeMode: Dispatch<SetStateAction<TranscodeMode>>;
  repeatMode: RepeatMode;
  setRepeatMode: Dispatch<SetStateAction<RepeatMode>>;
  shuffleEnabled: boolean;
  setShuffleEnabled: Dispatch<SetStateAction<boolean>>;
  recentTracks: Track[];
  requestTrackPlayback: (track: Track, queueSource?: Track[], options?: { startOffsetSec?: number }) => void;
  replayRecentTrack: (track: Track) => void;
  recordTrackPlayed: (track: Track) => void;
  removeTrackFromPlayback: (trackId: string) => void;
  setSelectedTrack: Dispatch<SetStateAction<Track | null>>;
  resetAfterLogout: () => void;
};

/**
 * Handles player queue, history and local storage persistence concerns.
 */
export function usePlaybackState({
  user,
  allTracksById,
  allTracks,
  loadingAllTracks
}: UsePlaybackStateArgs): UsePlaybackStateResult {
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [playQueue, setPlayQueue] = useState<Track[]>([]);
  const [playRequestNonce, setPlayRequestNonce] = useState(0);
  const [playRequestOffsetSec, setPlayRequestOffsetSec] = useState(0);
  const [transcodeMode, setTranscodeMode] = useState<TranscodeMode>(() => readTranscodeMode(TRANSCODE_MODE_STORAGE_KEY));
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffleEnabled, setShuffleEnabled] = useState<boolean>(() => readShuffleMode(SHUFFLE_MODE_STORAGE_KEY));
  const [queueRestoredFromStorage, setQueueRestoredFromStorage] = useState(false);
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);

  const selectedTrackRefreshed = useMemo(() => {
    if (!selectedTrack) {
      return null;
    }

    if (selectedTrack.owner === "radio") {
      return selectedTrack;
    }

    return allTracksById.get(selectedTrack.id) ?? selectedTrack;
  }, [allTracksById, selectedTrack]);

  const refreshedQueue = useMemo(() => {
    if (playQueue.length === 0) {
      return [] as Track[];
    }

    return playQueue.map((track) => {
      if (track.owner === "radio") {
        return track;
      }
      return allTracksById.get(track.id) ?? track;
    });
  }, [allTracksById, playQueue]);

  useEffect(() => {
    setQueueRestoredFromStorage(false);
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(RECENT_TRACKS_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }

      setRecentTracks(parsed.filter(isTrackLike).slice(0, MAX_RECENT_TRACKS));
    } catch {
      // ignore malformed local storage data
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(RECENT_TRACKS_STORAGE_KEY, JSON.stringify(recentTracks.slice(0, MAX_RECENT_TRACKS)));
    } catch {
      // ignore local storage write failures
    }
  }, [recentTracks]);

  useEffect(() => {
    if (!user || queueRestoredFromStorage) {
      return;
    }

    if (loadingAllTracks) {
      return;
    }

    if (selectedTrack || playQueue.length > 0) {
      setQueueRestoredFromStorage(true);
      return;
    }

    if (typeof window === "undefined") {
      setQueueRestoredFromStorage(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(CURRENT_QUEUE_STORAGE_KEY);
      if (!raw) {
        setQueueRestoredFromStorage(true);
        return;
      }

      const parsed = parseStoredQueueSnapshot(JSON.parse(raw));
      if (!parsed || parsed.userId !== user.id) {
        setQueueRestoredFromStorage(true);
        return;
      }

      const restoredQueue = parsed.trackIds
        .map((trackId) => allTracksById.get(trackId))
        .filter((track): track is Track => Boolean(track));

      if (restoredQueue.length > 0) {
        setPlayQueue(restoredQueue);
      }

      if (parsed.currentTrackId) {
        const restoredCurrentTrack =
          restoredQueue.find((track) => track.id === parsed.currentTrackId) ??
          allTracksById.get(parsed.currentTrackId);

        if (restoredCurrentTrack) {
          setSelectedTrack(restoredCurrentTrack);
        }
      }
    } catch {
      // ignore malformed local storage queue
    } finally {
      setQueueRestoredFromStorage(true);
    }
  }, [allTracksById, loadingAllTracks, playQueue.length, queueRestoredFromStorage, selectedTrack, user]);

  useEffect(() => {
    if (!user || typeof window === "undefined") {
      return;
    }

    const queueSource = refreshedQueue.length > 0 ? refreshedQueue : selectedTrackRefreshed ? [selectedTrackRefreshed] : [];

    if (queueSource.length === 0) {
      window.localStorage.removeItem(CURRENT_QUEUE_STORAGE_KEY);
      return;
    }

    try {
      const payload: StoredQueueSnapshot = {
        userId: user.id,
        trackIds: queueSource.map((track) => track.id),
        currentTrackId: selectedTrackRefreshed?.id ?? null
      };

      window.localStorage.setItem(CURRENT_QUEUE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore local storage write failures
    }
  }, [refreshedQueue, selectedTrackRefreshed, user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(TRANSCODE_MODE_STORAGE_KEY, transcodeMode);
  }, [transcodeMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SHUFFLE_MODE_STORAGE_KEY, shuffleEnabled ? "on" : "off");
  }, [shuffleEnabled]);

  const requestTrackPlayback = useCallback((
    track: Track,
    queueSource?: Track[],
    options?: { startOffsetSec?: number }
  ): void => {
    const source = queueSource && queueSource.length > 0 ? queueSource : allTracks;
    const requestedOffset = options?.startOffsetSec;
    const boundedOffset =
      typeof requestedOffset === "number" && Number.isFinite(requestedOffset)
        ? Math.max(0, Math.min(track.duration || 0, requestedOffset))
        : 0;

    setPlayQueue(source.length > 0 ? source : [track]);
    setSelectedTrack(track);
    setPlayRequestOffsetSec(boundedOffset);
    setPlayRequestNonce((current) => current + 1);
  }, [allTracks]);

  const replayRecentTrack = useCallback((track: Track): void => {
    const fullTrack = allTracksById.get(track.id) ?? track;
    requestTrackPlayback(fullTrack, allTracks.length > 0 ? allTracks : undefined);
  }, [allTracks, allTracksById, requestTrackPlayback]);

  const recordTrackPlayed = useCallback((track: Track): void => {
    setRecentTracks((current) => {
      const withoutCurrent = current.filter((entry) => entry.id !== track.id);
      return [track, ...withoutCurrent].slice(0, MAX_RECENT_TRACKS);
    });
  }, []);

  const removeTrackFromPlayback = useCallback((trackId: string): void => {
    if (selectedTrackRefreshed?.id === trackId) {
      setSelectedTrack(null);
    }

    setPlayQueue((current) => current.filter((track) => track.id !== trackId));
    setRecentTracks((current) => current.filter((track) => track.id !== trackId));
  }, [selectedTrackRefreshed?.id]);

  const resetAfterLogout = useCallback((): void => {
    setSelectedTrack(null);
    setPlayQueue([]);
    setRepeatMode("off");
    setShuffleEnabled(false);
  }, []);

  return {
    selectedTrackRefreshed,
    refreshedQueue,
    playRequestNonce,
    playRequestOffsetSec,
    transcodeMode,
    setTranscodeMode,
    repeatMode,
    setRepeatMode,
    shuffleEnabled,
    setShuffleEnabled,
    recentTracks,
    requestTrackPlayback,
    replayRecentTrack,
    recordTrackPlayed,
    removeTrackFromPlayback,
    setSelectedTrack,
    resetAfterLogout
  };
}
