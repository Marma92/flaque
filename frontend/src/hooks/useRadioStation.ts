import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createRadioStation, getRadioState, rebuildRadioStation } from "../api";
import type { RadioCreateResponse, RadioStateResponse, RadioTrack, Track } from "../types";

const RELOAD_BEFORE_NEXT_TRACK_END_MS = 40_000;

type RadioSnapshot = {
  serverNow: string;
  receivedAtMs: number;
  stationId: string;
  currentTrack: RadioTrack | null;
  nextTrack: RadioTrack | null;
};

type UseRadioStationArgs = {
  userId?: string;
  onPlayRadioTrack: (track: Track, startOffsetSec: number) => void;
};

type UseRadioStationResult = {
  loading: boolean;
  stationId: string | null;
  currentTrack: RadioTrack | null;
  nextTrack: RadioTrack | null;
  isRadioPlaybackActive: boolean;
  startRadioPlayback: () => Promise<void>;
  stopRadioPlayback: () => void;
};

function clampOffsetSec(offsetSec: number, durationSec: number): number {
  if (!Number.isFinite(offsetSec)) {
    return 0;
  }
  return Math.max(0, Math.min(durationSec, offsetSec));
}

function computeOffsetSec(serverNowMs: number, startsAtIso: string, durationSec: number): number {
  const startsAtMs = Date.parse(startsAtIso);
  const expectedOffsetSec = (serverNowMs - startsAtMs) / 1_000;
  return clampOffsetSec(expectedOffsetSec, durationSec);
}

function getEstimatedServerNowMs(snapshot: RadioSnapshot): number {
  const baseServerNowMs = Date.parse(snapshot.serverNow);
  const elapsedMs = Date.now() - snapshot.receivedAtMs;
  return baseServerNowMs + Math.max(0, elapsedMs);
}

function mapRadioTrackToPlayableTrack(track: RadioTrack): Track {
  return {
    id: track.trackId,
    owner: "radio",
    path: track.streamUrl,
    duration: track.durationSec,
    mimeType: "audio/mpeg",
    codec: "radio",
    tags: {
      title: track.title ?? undefined,
      artist: track.artist ?? undefined,
      album: track.album ?? undefined
    },
    cover: track.coverUrl ?? undefined
  };
}

function toSnapshotFromState(payload: RadioStateResponse): RadioSnapshot | null {
  if (payload.status !== "running" || !payload.station) {
    return null;
  }

  return {
    serverNow: payload.serverNow,
    receivedAtMs: Date.now(),
    stationId: payload.station.id,
    currentTrack: payload.station.currentTrack,
    nextTrack: payload.station.nextTrack
  };
}

function toSnapshotFromCreate(payload: RadioCreateResponse): RadioSnapshot | null {
  if (!payload.success || !payload.station) {
    return null;
  }

  return {
    serverNow: payload.serverNow,
    receivedAtMs: Date.now(),
    stationId: payload.station.id,
    currentTrack: payload.station.currentTrack,
    nextTrack: payload.station.nextTrack
  };
}

export function useRadioStation({ userId, onPlayRadioTrack }: UseRadioStationArgs): UseRadioStationResult {
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<RadioSnapshot | null>(null);
  const [isRadioPlaybackActive, setIsRadioPlaybackActive] = useState(false);
  const timelineRefreshTimeoutRef = useRef<number | null>(null);
  const rebuildRefreshTimeoutRef = useRef<number | null>(null);
  const radioPlaybackActiveRef = useRef(false);
  const onPlayRadioTrackRef = useRef(onPlayRadioTrack);

  useEffect(() => {
    onPlayRadioTrackRef.current = onPlayRadioTrack;
  }, [onPlayRadioTrack]);

  const clearRefreshTimers = useCallback(() => {
    if (timelineRefreshTimeoutRef.current !== null) {
      window.clearTimeout(timelineRefreshTimeoutRef.current);
      timelineRefreshTimeoutRef.current = null;
    }
    if (rebuildRefreshTimeoutRef.current !== null) {
      window.clearTimeout(rebuildRefreshTimeoutRef.current);
      rebuildRefreshTimeoutRef.current = null;
    }
  }, []);

  const syncPlaybackFromSnapshot = useCallback((input: RadioSnapshot): void => {
    if (!radioPlaybackActiveRef.current || !input.currentTrack) {
      return;
    }

    const playableTrack = mapRadioTrackToPlayableTrack(input.currentTrack);
    const offsetSec = computeOffsetSec(
      getEstimatedServerNowMs(input),
      input.currentTrack.startsAt,
      input.currentTrack.durationSec
    );
    onPlayRadioTrackRef.current(playableTrack, offsetSec);
  }, []);

  const playSnapshotNow = useCallback((input: RadioSnapshot | null): void => {
    if (!input?.currentTrack) {
      return;
    }

    const playableTrack = mapRadioTrackToPlayableTrack(input.currentTrack);
    const offsetSec = computeOffsetSec(
      getEstimatedServerNowMs(input),
      input.currentTrack.startsAt,
      input.currentTrack.durationSec
    );
    onPlayRadioTrackRef.current(playableTrack, offsetSec);
  }, []);

  const createAndUseStation = useCallback(async (): Promise<RadioSnapshot | null> => {
    const created = await createRadioStation();
    const nextSnapshot = toSnapshotFromCreate(created);
    setSnapshot(nextSnapshot);
    if (nextSnapshot) {
      syncPlaybackFromSnapshot(nextSnapshot);
    }
    return nextSnapshot;
  }, [syncPlaybackFromSnapshot]);

  const refreshStation = useCallback(async (): Promise<void> => {
    try {
      const statePayload = await getRadioState();
      let nextSnapshot = toSnapshotFromState(statePayload);

      if (!nextSnapshot) {
        nextSnapshot = await createAndUseStation();
        return;
      }

      if (nextSnapshot.nextTrack === null) {
        const rebuilt = await rebuildRadioStation(nextSnapshot.stationId);
        const rebuiltSnapshot = toSnapshotFromCreate(rebuilt);
        nextSnapshot = rebuiltSnapshot ?? nextSnapshot;
      }

      setSnapshot(nextSnapshot);
      syncPlaybackFromSnapshot(nextSnapshot);
    } catch {
      try {
        const createdSnapshot = await createAndUseStation();
        if (createdSnapshot) {
          setSnapshot(createdSnapshot);
          syncPlaybackFromSnapshot(createdSnapshot);
          return;
        }
      } catch {
        // ignore fallback create errors
      }

      setSnapshot(null);
    }
  }, [createAndUseStation, syncPlaybackFromSnapshot]);

  const bootstrapStation = useCallback(async (): Promise<void> => {
    if (!userId) {
      setSnapshot(null);
      return;
    }

    setLoading(true);
    try {
      const statePayload = await getRadioState();
      let nextSnapshot = toSnapshotFromState(statePayload);

      if (!nextSnapshot) {
        nextSnapshot = await createAndUseStation();
      } else if (nextSnapshot.nextTrack === null) {
        const rebuilt = await rebuildRadioStation(nextSnapshot.stationId);
        nextSnapshot = toSnapshotFromCreate(rebuilt) ?? nextSnapshot;
      } else {
        setSnapshot(nextSnapshot);
      }

      if (nextSnapshot) {
        syncPlaybackFromSnapshot(nextSnapshot);
      }
    } catch {
      try {
        const createdSnapshot = await createAndUseStation();
        if (createdSnapshot) {
          setSnapshot(createdSnapshot);
          syncPlaybackFromSnapshot(createdSnapshot);
          return;
        }
      } catch {
        // ignore fallback create errors
      }

      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [createAndUseStation, syncPlaybackFromSnapshot, userId]);

  const startRadioPlayback = useCallback(async (): Promise<void> => {
    radioPlaybackActiveRef.current = true;
    setIsRadioPlaybackActive(true);

    if (snapshot?.currentTrack) {
      playSnapshotNow(snapshot);
      return;
    }

    try {
      const statePayload = await getRadioState();
      let nextSnapshot = toSnapshotFromState(statePayload);
      if (!nextSnapshot) {
        nextSnapshot = await createAndUseStation();
      }

      if (!nextSnapshot) {
        return;
      }

      setSnapshot(nextSnapshot);
      playSnapshotNow(nextSnapshot);
    } catch {
      // ignore network errors; UI keeps previous station state
    }
  }, [createAndUseStation, playSnapshotNow, snapshot]);

  const stopRadioPlayback = useCallback((): void => {
    radioPlaybackActiveRef.current = false;
    setIsRadioPlaybackActive(false);
  }, []);

  useEffect(() => {
    if (!userId) {
      stopRadioPlayback();
    }
  }, [stopRadioPlayback, userId]);

  useEffect(() => {
    clearRefreshTimers();
    void bootstrapStation();

    return () => {
      clearRefreshTimers();
    };
  }, [bootstrapStation, clearRefreshTimers]);

  useEffect(() => {
    clearRefreshTimers();

    if (!snapshot) {
      return;
    }

    const estimatedServerNowMs = getEstimatedServerNowMs(snapshot);

    if (snapshot.currentTrack) {
      const timelineRefreshAtMs = Date.parse(snapshot.currentTrack.endsAt) + 250;
      const timelineDelayMs = Math.max(0, timelineRefreshAtMs - estimatedServerNowMs);
      timelineRefreshTimeoutRef.current = window.setTimeout(() => {
        void refreshStation();
      }, timelineDelayMs);
    }

    if (snapshot.nextTrack) {
      const rebuildRefreshAtMs = Date.parse(snapshot.nextTrack.endsAt) - RELOAD_BEFORE_NEXT_TRACK_END_MS;
      const rebuildDelayMs = Math.max(0, rebuildRefreshAtMs - estimatedServerNowMs);
      rebuildRefreshTimeoutRef.current = window.setTimeout(() => {
        void refreshStation();
      }, rebuildDelayMs);
    }

    return () => {
      clearRefreshTimers();
    };
  }, [clearRefreshTimers, refreshStation, snapshot]);

  const result = useMemo<UseRadioStationResult>(() => ({
    loading,
    stationId: snapshot?.stationId ?? null,
    currentTrack: snapshot?.currentTrack ?? null,
    nextTrack: snapshot?.nextTrack ?? null,
    isRadioPlaybackActive,
    startRadioPlayback,
    stopRadioPlayback
  }), [
    isRadioPlaybackActive,
    loading,
    snapshot?.currentTrack,
    snapshot?.nextTrack,
    snapshot?.stationId,
    startRadioPlayback,
    stopRadioPlayback
  ]);

  return result;
}
