import { useCallback } from "react";

import { getAutoPlaylists } from "../api";
import type { AutoPlaylistSummary } from "../types";
import { useQuery } from "./useQuery";

type UseAutoPlaylistsResult = {
  autoPlaylists: AutoPlaylistSummary[];
  loading: boolean;
  refresh: () => void;
};

const EMPTY: AutoPlaylistSummary[] = [];

export function useAutoPlaylists(): UseAutoPlaylistsResult {
  const fetcher = useCallback(() => getAutoPlaylists(), []);
  const { data, loading, refresh } = useQuery<AutoPlaylistSummary[]>(fetcher, EMPTY);
  return { autoPlaylists: data, loading, refresh };
}
