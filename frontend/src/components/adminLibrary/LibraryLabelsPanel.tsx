import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { getLibraryGenreLabels, type LibraryGenreLabel } from "../../api";

type Props = {
  /**
   * Bumped by the parent whenever an upstream action (e.g. adding a
   * synonym) should trigger a re-load.
   */
  refreshKey?: number;
  /** Clicking "Promote" on a row calls this with the raw label string. */
  onPromote: (label: string) => void;
};

const LABEL_DISPLAY_LIMIT = 100;

export function LibraryLabelsPanel({ refreshKey = 0, onPromote }: Props): JSX.Element {
  const { t } = useTranslation("admin");
  const [labels, setLabels] = useState<LibraryGenreLabel[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLibraryGenreLabels();
      setLabels(data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  return (
    <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xl text-flaque-ink">{t("labels.title")}</h3>
        <button
          type="button"
          className="rounded-xl border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream"
          onClick={() => { void load(); }}
        >
          {t("labels.refresh")}
        </button>
      </div>
      <p className="mt-1 text-sm text-flaque-steel">
        <Trans i18nKey="labels.description" ns="admin" components={{ strong: <strong /> }} />
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-flaque-steel">{t("loading")}</p>
      ) : labels.length === 0 ? (
        <p className="mt-3 text-sm text-flaque-steel">{t("labels.empty")}</p>
      ) : (
        <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-flaque-clay/40">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
              <tr>
                <th className="px-3 py-2 font-medium">{t("labels.colLabel")}</th>
                <th className="w-20 px-3 py-2 font-medium">{t("labels.colTracks")}</th>
                <th className="px-3 py-2 font-medium">{t("labels.colNormalized")}</th>
                <th className="w-24 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {labels.slice(0, LABEL_DISPLAY_LIMIT).map((row) => (
                <tr key={row.label} className="border-t border-flaque-clay/30">
                  <td className="px-3 py-1.5 text-flaque-ink">{row.label}</td>
                  <td className="px-3 py-1.5 text-flaque-steel">{row.count}</td>
                  <td className="px-3 py-1.5 text-flaque-steel">
                    {row.canonical ? (
                      <span className="text-amber-700">{row.canonical}</span>
                    ) : (
                      <span className="text-flaque-steel/60">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      className="text-xs text-flaque-ink underline-offset-2 hover:underline"
                      onClick={() => onPromote(row.label)}
                    >
                      {t("labels.promote")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {labels.length > LABEL_DISPLAY_LIMIT ? (
        <p className="mt-2 text-xs text-flaque-steel/70">
          {t("labels.showing", { limit: LABEL_DISPLAY_LIMIT, total: labels.length })}
        </p>
      ) : null}
    </section>
  );
}
