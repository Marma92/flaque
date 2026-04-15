import { useCallback, useEffect, useState } from "react";

import { getAutoPlaylists } from "../api";
import type { AutoPlaylistSummary } from "../types";

type UseAutoPlaylistsResult = {
  autoPlaylists: AutoPlaylistSummary[];
  loading: boolean;
  refresh: () => void;
};

export function useAutoPlaylists(): UseAutoPlaylistsResult {
  const [autoPlaylists, setAutoPlaylists] = useState<AutoPlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(() => {
    setLoading(true);
    getAutoPlaylists()
      .then(setAutoPlaylists)
      .catch(() => setAutoPlaylists([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { autoPlaylists, loading, refresh: fetch };
}
