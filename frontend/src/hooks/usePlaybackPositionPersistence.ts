import { useEffect, useRef } from "react";

import { setMyPlaybackState } from "../api";
import type { Track } from "../types";

const PERSIST_INTERVAL_MS = 15_000;

type UsePlaybackPositionPersistenceInput = {
  track: Track | null;
  currentTime: number;
  isPlaying: boolean;
};

/**
 * Periodically persists the user's current track + position to the backend so
 * the Home view can offer a cross-device "Resume" affordance. Skips radio
 * tracks (owner === "radio") since they aren't resumable.
 */
export function usePlaybackPositionPersistence({
  track,
  currentTime,
  isPlaying
}: UsePlaybackPositionPersistenceInput): void {
  const lastPersistedTrackIdRef = useRef<string | null>(null);
  const lastPersistedAtRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!track || track.owner === "radio") {
      return;
    }

    const persist = (positionSec: number): void => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      lastPersistedAtRef.current = Date.now();
      lastPersistedTrackIdRef.current = track.id;

      setMyPlaybackState({ trackId: track.id, positionSec })
        .catch(() => {
          // ignore: persistence is best-effort
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    // On a fresh track, write the starting position right away so a resume on
    // another device knows what's loaded even if the user immediately closes.
    if (lastPersistedTrackIdRef.current !== track.id) {
      persist(Math.max(0, currentTime));
      return;
    }

    if (!isPlaying) {
      return;
    }

    const elapsedSinceLast = Date.now() - lastPersistedAtRef.current;
    if (elapsedSinceLast < PERSIST_INTERVAL_MS) {
      return;
    }

    persist(Math.max(0, currentTime));
  }, [track, isPlaying, currentTime]);
}
