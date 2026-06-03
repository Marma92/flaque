import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  clearEnrichmentLog,
  getEnrichmentLog,
  type EnrichmentLogEntry
} from "../../api";

type Props = {
  /**
   * Bumped by the parent on each enrichment poll tick. We re-fetch the
   * log whenever this changes, in addition to the manual refresh button.
   */
  refreshKey?: number;
};

const LOG_FETCH_LIMIT = 50;

function summarizeFilled(entry: EnrichmentLogEntry): string {
  const parts: string[] = [];
  if (entry.filledGenre && entry.filledGenre.length > 0) {
    parts.push(`genre: ${entry.filledGenre.join(", ")}`);
  }
  if (entry.filledYear !== undefined) parts.push(`year: ${entry.filledYear}`);
  if (entry.coverFetched) parts.push("cover");
  if (entry.filledRecordingMbid) parts.push("MBID");
  if (entry.errorMessage) parts.push(`error: ${entry.errorMessage}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function outcomeClass(status: EnrichmentLogEntry["status"]): string {
  switch (status) {
    case "hit": return "text-green-600";
    case "failed": return "text-red-500";
    case "miss": return "text-flaque-steel";
    default: return "text-flaque-steel/60";
  }
}

export function EnrichmentLogPanel({ refreshKey = 0 }: Props): JSX.Element {
  const { t } = useTranslation("admin");
  const [entries, setEntries] = useState<EnrichmentLogEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await getEnrichmentLog(LOG_FETCH_LIMIT);
      setEntries(data);
    } catch {}
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  async function handleClear(): Promise<void> {
    try {
      await clearEnrichmentLog();
      setEntries([]);
    } catch {}
  }

  return (
    <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xl text-flaque-ink">{t("enrichmentLog.title")}</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-xl border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream"
            onClick={() => { void load(); }}
          >
            {t("enrichmentLog.refresh")}
          </button>
          {entries.length > 0 ? (
            <button
              type="button"
              className="rounded-xl border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream"
              onClick={() => { void handleClear(); }}
            >
              {t("enrichmentLog.clearLog")}
            </button>
          ) : null}
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-flaque-steel">{t("enrichmentLog.empty")}</p>
      ) : (
        <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-flaque-clay/40">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
              <tr>
                <th className="px-3 py-2 font-medium">{t("enrichmentLog.colWhen")}</th>
                <th className="px-3 py-2 font-medium">{t("enrichmentLog.colTrack")}</th>
                <th className="px-3 py-2 font-medium">{t("enrichmentLog.colSource")}</th>
                <th className="px-3 py-2 font-medium">{t("enrichmentLog.colOutcome")}</th>
                <th className="px-3 py-2 font-medium">{t("enrichmentLog.colFilled")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={`${entry.timestamp}-${entry.trackId}-${i}`} className="border-t border-flaque-clay/30">
                  <td className="whitespace-nowrap px-3 py-1.5 text-flaque-steel">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="text-flaque-ink">{entry.title}</span>
                    <span className="text-flaque-steel/60"> — </span>
                    <span className="text-flaque-steel">{entry.artist}</span>
                  </td>
                  <td className="px-3 py-1.5 text-flaque-steel">{entry.source}</td>
                  <td className={`px-3 py-1.5 ${outcomeClass(entry.status)}`}>
                    {entry.status}
                  </td>
                  <td className="px-3 py-1.5 text-flaque-steel">
                    {summarizeFilled(entry)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
