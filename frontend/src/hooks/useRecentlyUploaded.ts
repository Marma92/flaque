import { useEffect, useRef, useState } from "react";

import { getTracks } from "../api";
import type { Track, User } from "../types";

export type UploadPeriod = "7d" | "30d";

const PERIOD_MS: Record<UploadPeriod, number> = {
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000
};

type UseRecentlyUploadedArgs = {
  user: User | null;
  ownerFilter?: string;
};

type UseRecentlyUploadedResult = {
  tracks: Track[];
  loading: boolean;
  period: UploadPeriod;
  setPeriod: (period: UploadPeriod) => void;
  refresh: () => void;
};

export function useRecentlyUploaded({
  user,
  ownerFilter
}: UseRecentlyUploadedArgs): UseRecentlyUploadedResult {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<UploadPeriod>("7d");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!user) {
      setTracks([]);
      setLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);

    const addedAfter = new Date(Date.now() - PERIOD_MS[period]).toISOString();

    getTracks({
      sortBy: "addedAt",
      sortDir: "desc",
      limit: 12,
      addedAfter,
      owner: ownerFilter
    })
      .then((response) => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setTracks(response.tracks);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) {
          return;
        }
        setTracks([]);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      });
  }, [user, ownerFilter, period, refreshNonce]);

  function refresh(): void {
    setRefreshNonce((n) => n + 1);
  }

  return { tracks, loading, period, setPeriod, refresh };
}
