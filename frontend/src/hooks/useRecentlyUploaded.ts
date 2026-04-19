import { useCallback, useState } from "react";

import { getTracks } from "../api";
import type { Track, User } from "../types";
import { useQuery } from "./useQuery";

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

const EMPTY: Track[] = [];

export function useRecentlyUploaded({
  user,
  ownerFilter
}: UseRecentlyUploadedArgs): UseRecentlyUploadedResult {
  const [period, setPeriod] = useState<UploadPeriod>("7d");

  const fetcher = useCallback(async () => {
    const addedAfter = new Date(Date.now() - PERIOD_MS[period]).toISOString();
    const response = await getTracks({
      sortBy: "addedAt",
      sortDir: "desc",
      limit: 12,
      addedAfter,
      owner: ownerFilter
    });
    return response.tracks;
  }, [period, ownerFilter]);

  const { data, loading, refresh } = useQuery<Track[]>(fetcher, EMPTY, { enabled: Boolean(user) });

  return { tracks: data, loading, period, setPeriod, refresh };
}
