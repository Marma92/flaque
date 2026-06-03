import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("admin");
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
      <h3 className="font-display text-xl text-flaque-ink">{t("enrichment.title")}</h3>
      <p className="mt-1 text-sm text-flaque-steel">
        {t("enrichment.description")}
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
              ? t("enrichment.stop")
              : t("enrichment.start")}
        </button>
      </div>

      {status && status.running ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 text-sm text-flaque-steel">
            <span>{t("enrichment.progress", { processed: status.processed, total: status.total })}</span>
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
              <span className="text-flaque-steel/60">{t("enrichment.now")}</span>
              <span className="text-flaque-ink">{status.currentTrack.title}</span>
              <span className="text-flaque-steel/60"> — </span>
              <span className="text-flaque-steel">{status.currentTrack.artist}</span>
            </p>
          ) : null}
          <div className="flex gap-3 text-xs text-flaque-steel">
            <span className="text-green-600">{t("enrichment.enriched", { count: status.enriched })}</span>
            {status.failed > 0 ? (
              <span className="text-red-500">{t("enrichment.failed", { count: status.failed })}</span>
            ) : null}
          </div>
        </div>
      ) : status && !status.running && status.processed > 0 ? (
        <div className="mt-3 space-y-1">
          <p className="text-sm text-flaque-steel">
            {t("enrichment.lastRun", { processed: status.processed, total: status.total })}
          </p>
          <div className="flex gap-3 text-xs text-flaque-steel">
            <span className="text-green-600">{t("enrichment.enriched", { count: status.enriched })}</span>
            {status.failed > 0 ? (
              <span className="text-red-500">{t("enrichment.failed", { count: status.failed })}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {cacheStats ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-flaque-steel">
              {t("enrichment.cachePrefix")}
              {t("enrichment.cacheEntries", { count: cacheStats.entries })}
              {typeof cacheStats.fingerprints === "number"
                ? ` · ${t("enrichment.cacheFingerprints", { count: cacheStats.fingerprints })}`
                : ""}
              {typeof cacheStats.acoustid === "number"
                ? ` · ${t("enrichment.cacheAcoustid", { count: cacheStats.acoustid })}`
                : ""}
            </span>
            <button
              type="button"
              className="rounded-lg border border-flaque-clay px-3 py-1 text-xs text-flaque-ink transition hover:bg-flaque-cream"
              onClick={() => { void handleClearCache(); }}
            >
              {t("enrichment.clearCache")}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-flaque-steel/80">
            <span
              className={`rounded px-2 py-0.5 ${
                cacheStats.acoustIdConfigured
                  ? "bg-green-100 text-green-700"
                  : "bg-flaque-clay/40 text-flaque-steel"
              }`}
              title={t("enrichment.acoustIdHint")}
            >
              {t("enrichment.acoustIdLabel", { status: cacheStats.acoustIdConfigured ? t("enrichment.configured") : t("enrichment.notConfigured") })}
            </span>
            <span
              className={`rounded px-2 py-0.5 ${
                cacheStats.fingerprintingAvailable
                  ? "bg-green-100 text-green-700"
                  : "bg-flaque-clay/40 text-flaque-steel"
              }`}
              title={t("enrichment.fpcalcHint")}
            >
              {t("enrichment.fpcalcLabel", { status: cacheStats.fingerprintingAvailable ? t("enrichment.available") : t("enrichment.notDetected") })}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
