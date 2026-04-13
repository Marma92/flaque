import { useCallback, useEffect, useState } from "react";

import { getForYouPlaylists, dismissForYouPlaylist as apiDismiss } from "../api";
import type { ForYouPlaylistSummary } from "../types";

type UseForYouPlaylistsResult = {
  forYouPlaylists: ForYouPlaylistSummary[];
  loading: boolean;
  refresh: () => void;
  dismiss: (playlistId: string) => Promise<void>;
};

export function useForYouPlaylists(): UseForYouPlaylistsResult {
  const [forYouPlaylists, setForYouPlaylists] = useState<ForYouPlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(() => {
    setLoading(true);
    getForYouPlaylists()
      .then(setForYouPlaylists)
      .catch(() => setForYouPlaylists([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const dismiss = useCallback(async (playlistId: string) => {
    await apiDismiss(playlistId);
    setForYouPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
  }, []);

  return { forYouPlaylists, loading, refresh: fetch, dismiss };
}
