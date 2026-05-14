import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearGenreCache,
  getEnrichmentStatus,
  getGenreCacheStats,
  startEnrichment,
  stopEnrichment,
  type EnrichmentStatus,
  type GenreCacheStats
} from "../../api";

type Props = {
  /**
   * Fires on every status poll. The parent uses this to keep the
   * activity log fresh while a run is in progress.
   */
  onPollTick?: (status: EnrichmentStatus) => void;
};

const POLL_INTERVAL_MS = 2000;
// Brief pause to let the backend reflect a start/stop click before we
// re-fetch status. Avoids a flash of stale state.
const TOGGLE_SETTLE_MS = 500;

export function EnrichmentPanel({ onPollTick }: Props): JSX.Element {
  const [status, setStatus] = useState<EnrichmentStatus | null>(null);
  const [toggling, setToggling] = useState(false);
  const [cacheStats, setCacheStats] = useState<GenreCacheStats | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPollTickRef = useRef(onPollTick);

  useEffect(() => { onPollTickRef.current = onPollTick; }, [onPollTick]);

  const pollStatus = useCallback(async (): Promise<EnrichmentStatus | null> => {
    try {
      const s = await getEnrichmentStatus();
      setStatus(s);
      onPollTickRef.current?.(s);
      if (s.running) {
        const stats = await getGenreCacheStats().catch(() => null);
        if (stats) setCacheStats(stats);
      }
      return s;
    } catch {
      return null;
    }
  }, []);

  const loadCacheStats = useCallback(async () => {
    try {
      const stats = await getGenreCacheStats();
      setCacheStats(stats);
    } catch {}
  }, []);

  function stopPolling(): void {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => {
    void pollStatus();
    void loadCacheStats();
    return stopPolling;
  }, [pollStatus, loadCacheStats]);

  useEffect(() => {
    if (status?.running) {
      stopPolling();
      pollRef.current = setInterval(() => { void pollStatus(); }, POLL_INTERVAL_MS);
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [status?.running, pollStatus]);

  async function handleToggle(): Promise<void> {
    setToggling(true);
    try {
      if (status?.running) await stopEnrichment();
      else await startEnrichment();
      await new Promise((r) => setTimeout(r, TOGGLE_SETTLE_MS));
      const fresh = await pollStatus();
      if (fresh && !fresh.running) await loadCacheStats();
    } catch {} finally {
      setToggling(false);
    }
  }

  async function handleClearCache(): Promise<void> {
    try {
      await clearGenreCache();
      await loadCacheStats();
    } catch {}
  }

  const percent = status && status.total > 0
    ? Math.round((status.processed / status.total) * 100)
    : 0;

  return (
    <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h3 className="font-display text-xl text-flaque-ink">MusicBrainz Enrichment</h3>
      <p className="mt-1 text-sm text-flaque-steel">
        Enrich tracks missing genre data by looking them up on MusicBrainz.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
            status?.running
              ? "border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
              : "bg-flaque-ink text-flaque-cream hover:bg-black"
          }`}
          onClick={() => { void handleToggle(); }}
          disabled={toggling}
        >
          {toggling
            ? "..."
            : status?.running
              ? "Stop enrichment"
              : "Start enrichment"}
        </button>
      </div>

      {status && status.running ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-flaque-steel">
            <span>{status.processed} / {status.total} tracks processed</span>
            <span className="text-flaque-steel/60">({percent}%)</span>
          </div>
          {status.total > 0 ? (
            <div className="h-2 w-full overflow-hidden rounded-full bg-flaque-clay/20">
              <div
                className="h-full rounded-full bg-flaque-ink transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
          {status.currentTrack ? (
            <p className="text-xs text-flaque-steel">
              <span className="text-flaque-steel/60">Now: </span>
              <span className="text-flaque-ink">{status.currentTrack.title}</span>
              <span className="text-flaque-steel/60"> — </span>
              <span className="text-flaque-steel">{status.currentTrack.artist}</span>
            </p>
          ) : null}
          <div className="flex gap-3 text-xs text-flaque-steel">
            <span className="text-green-600">{status.enriched} enriched</span>
            {status.failed > 0 ? (
              <span className="text-red-500">{status.failed} failed</span>
            ) : null}
          </div>
        </div>
      ) : status && !status.running && status.processed > 0 ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm text-flaque-steel">
            Last run: {status.processed} / {status.total} tracks processed
          </p>
          <div className="flex gap-3 text-xs text-flaque-steel">
            <span className="text-green-600">{status.enriched} enriched</span>
            {status.failed > 0 ? (
              <span className="text-red-500">{status.failed} failed</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {cacheStats ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-flaque-steel">
              Cache: {cacheStats.entries} {cacheStats.entries === 1 ? "MB entry" : "MB entries"}
              {typeof cacheStats.fingerprints === "number"
                ? ` · ${cacheStats.fingerprints} fingerprint${cacheStats.fingerprints === 1 ? "" : "s"}`
                : ""}
              {typeof cacheStats.acoustid === "number"
                ? ` · ${cacheStats.acoustid} AcoustID`
                : ""}
            </span>
            <button
              type="button"
              className="rounded-lg border border-flaque-clay px-3 py-1 text-xs text-flaque-ink transition hover:bg-flaque-cream"
              onClick={() => { void handleClearCache(); }}
            >
              Clear cache
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-flaque-steel/80">
            <span
              className={`rounded px-2 py-0.5 ${
                cacheStats.acoustIdConfigured
                  ? "bg-green-100 text-green-700"
                  : "bg-flaque-clay/40 text-flaque-steel"
              }`}
              title="Set ACOUSTID_API_KEY on the server to enable fingerprint fallback for tracks with bad tags."
            >
              AcoustID: {cacheStats.acoustIdConfigured ? "configured" : "not configured"}
            </span>
            <span
              className={`rounded px-2 py-0.5 ${
                cacheStats.fingerprintingAvailable
                  ? "bg-green-100 text-green-700"
                  : "bg-flaque-clay/40 text-flaque-steel"
              }`}
              title="Install the chromaprint (fpcalc) binary on the server to enable audio fingerprinting."
            >
              fpcalc: {cacheStats.fingerprintingAvailable ? "available" : "not detected"}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
