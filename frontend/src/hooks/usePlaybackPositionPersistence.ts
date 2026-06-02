import { useEffect, useRef } from "react";

import { setMyPlaybackState } from "../api";
import type { Track } from "../types";

const PERSIST_INTERVAL_MS = 15_000;

type UsePlaybackPositionPersistenceInput = {
  track: Track | null;
  currentTime: number;
  isPlaying: boolean;
  queue: Track[];
};

/**
 * Periodically persists the user's current track + position to the backend so
 * the Home view can offer a cross-device "Resume" affordance. The current queue
 * is persisted alongside it (on track/queue changes only) so resuming continues
 * playback past the current track. Skips radio tracks (owner === "radio") since
 * they aren't resumable.
 */
export function usePlaybackPositionPersistence({
  track,
  currentTime,
  isPlaying,
  queue
}: UsePlaybackPositionPersistenceInput): void {
  const lastPersistedTrackIdRef = useRef<string | null>(null);
  const lastPersistedQueueSigRef = useRef<string | null>(null);
  const lastPersistedAtRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!track || track.owner === "radio") {
      return;
    }

    const queueIds = queue
      .filter((entry) => entry.owner !== "radio")
      .map((entry) => entry.id);
    const queueSig = queueIds.join(",");

    const persist = (positionSec: number, includeQueue: boolean): void => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      lastPersistedAtRef.current = Date.now();
      lastPersistedTrackIdRef.current = track.id;
      lastPersistedQueueSigRef.current = queueSig;

      setMyPlaybackState({
        trackId: track.id,
        positionSec,
        ...(includeQueue ? { queue: queueIds } : {})
      })
        .catch(() => {
          // ignore: persistence is best-effort
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    // On a fresh track or a changed queue, write right away (including the queue)
    // so a resume on another device knows what's loaded and can play on past the
    // current track, even if the user immediately closes.
    const trackChanged = lastPersistedTrackIdRef.current !== track.id;
    const queueChanged = lastPersistedQueueSigRef.current !== queueSig;
    if (trackChanged || queueChanged) {
      persist(Math.max(0, currentTime), true);
      return;
    }

    if (!isPlaying) {
      return;
    }

    const elapsedSinceLast = Date.now() - lastPersistedAtRef.current;
    if (elapsedSinceLast < PERSIST_INTERVAL_MS) {
      return;
    }

    // Position-only update; the queue is left untouched server-side.
    persist(Math.max(0, currentTime), false);
  }, [track, isPlaying, currentTime, queue]);
}
