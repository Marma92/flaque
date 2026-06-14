import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { getLibrarySettings, patchLibrarySettings, type LibrarySettings } from "../../api";

/**
 * Admin-only library setting: switch the embedding backend between CLAP
 * (Python sidecar, default) and the legacy in-process MFCC pipeline.
 *
 * Stateless — reads the current setting from `/api/library/settings` on
 * mount and PATCHes back on toggle. Backfill of existing tracks happens
 * automatically on the next regeneration; the panel does not trigger it
 * directly.
 */
export function AiRecommendationPanel(): JSX.Element {
  const { t } = useTranslation("admin");
  const [settings, setSettings] = useState<LibrarySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      setSettings(await getLibrarySettings());
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("ai.loadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(next: boolean): Promise<void> {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await patchLibrarySettings({ aiRecommendation: next });
      setSettings(updated);
      setMessage(next ? t("ai.enabledMessage") : t("ai.disabledMessage"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : t("ai.updateFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h3 className="font-display text-xl text-flaque-ink">{t("ai.title")}</h3>
      <p className="mt-1 text-sm text-flaque-steel">{t("ai.description")}</p>
      <p className="mt-1 text-xs text-flaque-steel">
        <Trans i18nKey="ai.note" ns="admin" components={{ code: <code className="font-mono" /> }} />
      </p>

      {loading || !settings ? (
        <p className="mt-3 text-sm text-flaque-steel">{t("loading")}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 cursor-pointer accent-flaque-ink"
              checked={settings.aiRecommendation}
              disabled={saving}
              onChange={(e) => {
                void handleToggle(e.target.checked);
              }}
              aria-label={t("ai.enableAria")}
            />
            <span className="text-sm text-flaque-ink">
              <span className="font-semibold">
                {settings.aiRecommendation ? t("ai.enabled") : t("ai.disabled")}
              </span>
              <span className="block text-xs text-flaque-steel">
                {settings.aiRecommendation ? t("ai.clapDetail") : t("ai.mfccDetail")}
              </span>
            </span>
          </label>

          {message ? <p className="text-sm text-flaque-steel">{message}</p> : null}
        </div>
      )}
    </section>
  );
}
