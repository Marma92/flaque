import { useCallback } from "react";

import { getPersonalPlaylists, regeneratePersonalPlaylists } from "../api";
import type { PersonalPlaylistSummary } from "../types";
import { useQuery } from "./useQuery";

type UsePersonalPlaylistsResult = {
  personalPlaylists: PersonalPlaylistSummary[];
  loading: boolean;
  refresh: () => void;
  regenerate: () => Promise<{ regenerated: number }>;
};

const EMPTY: PersonalPlaylistSummary[] = [];

export function usePersonalPlaylists(): UsePersonalPlaylistsResult {
  const fetcher = useCallback(() => getPersonalPlaylists(), []);
  const { data, loading, refresh, setData } = useQuery<PersonalPlaylistSummary[]>(fetcher, EMPTY);

  const regenerate = useCallback(async () => {
    const result = await regeneratePersonalPlaylists();
    const updated = await getPersonalPlaylists();
    setData(updated);
    return result;
  }, [setData]);

  return { personalPlaylists: data, loading, refresh, regenerate };
}
