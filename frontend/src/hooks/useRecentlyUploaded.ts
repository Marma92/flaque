import { useCallback, useState } from "react";

import { getRecentUploads } from "../api";
import type { RecentUploadItem } from "../api";
import type { User } from "../types";
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
  items: RecentUploadItem[];
  loading: boolean;
  period: UploadPeriod;
  setPeriod: (period: UploadPeriod) => void;
  refresh: () => void;
};

const EMPTY: RecentUploadItem[] = [];

export function useRecentlyUploaded({
  user,
  ownerFilter
}: UseRecentlyUploadedArgs): UseRecentlyUploadedResult {
  const [period, setPeriod] = useState<UploadPeriod>("7d");

  const fetcher = useCallback(async () => {
    const addedAfter = new Date(Date.now() - PERIOD_MS[period]).toISOString();
    return getRecentUploads({ addedAfter, limit: 12, owner: ownerFilter });
  }, [period, ownerFilter]);

  const { data, loading, refresh } = useQuery<RecentUploadItem[]>(fetcher, EMPTY, { enabled: Boolean(user) });

  return { items: data, loading, period, setPeriod, refresh };
}
