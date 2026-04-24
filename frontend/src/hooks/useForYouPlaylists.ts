import { useCallback } from "react";

import { getForYouPlaylists, dismissForYouPlaylist as apiDismiss, regenerateForYouPlaylists } from "../api";
import type { ForYouPlaylistSummary } from "../types";
import { useQuery } from "./useQuery";

type UseForYouPlaylistsResult = {
  forYouPlaylists: ForYouPlaylistSummary[];
  loading: boolean;
  refresh: () => void;
  dismiss: (playlistId: string) => Promise<void>;
  regenerate: () => Promise<{ regenerated: number }>;
};

const EMPTY: ForYouPlaylistSummary[] = [];

export function useForYouPlaylists(): UseForYouPlaylistsResult {
  const fetcher = useCallback(() => getForYouPlaylists(), []);
  const { data, loading, refresh, setData } = useQuery<ForYouPlaylistSummary[]>(fetcher, EMPTY);

  const dismiss = useCallback(async (playlistId: string) => {
    await apiDismiss(playlistId);
    setData((prev) => prev.filter((p) => p.id !== playlistId));
  }, [setData]);

  const regenerate = useCallback(async () => {
    const result = await regenerateForYouPlaylists();
    const updated = await getForYouPlaylists();
    setData(updated);
    return result;
  }, [setData]);

  return { forYouPlaylists: data, loading, refresh, dismiss, regenerate };
}
