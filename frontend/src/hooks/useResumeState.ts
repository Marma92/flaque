import { useCallback, useEffect, useState } from "react";

import { clearMyPlaybackState, getMyPlaybackState, type PlaybackState } from "../api";

type UseResumeStateResult = {
  resumeState: PlaybackState | null;
  loading: boolean;
  dismiss: () => Promise<void>;
  refresh: () => Promise<void>;
};

/**
 * Loads the user's last-played track + position once on mount. Exposes a
 * `dismiss` helper that clears the server state (used by the Home view's
 * Resume row when the user closes it).
 */
export function useResumeState(userId: string | undefined): UseResumeStateResult {
  const [resumeState, setResumeState] = useState<PlaybackState | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) {
      setResumeState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const state = await getMyPlaybackState();
      setResumeState(state);
    } catch {
      setResumeState(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dismiss = useCallback(async (): Promise<void> => {
    setResumeState(null);
    if (!userId) return;
    try {
      await clearMyPlaybackState();
    } catch {
      // ignore: dismissal is best-effort
    }
  }, [userId]);

  return { resumeState, loading, dismiss, refresh };
}
