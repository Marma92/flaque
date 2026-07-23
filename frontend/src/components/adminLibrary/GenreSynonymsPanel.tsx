import { FormEvent, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { useTranslation } from "react-i18next";

import {
  deleteGenreSynonym,
  getGenreSynonyms,
  putGenreSynonym,
  reapplyGenreSynonyms,
  resetGenreSynonyms,
  type GenreSynonyms
} from "../../api";

export type GenreSynonymsPanelHandle = {
  /** Pre-fill the "from" field and scroll/focus the form. */
  promoteLabel: (label: string) => void;
};

type Props = {
  /** Called whenever the synonym table changes (add/delete/reset/reapply). */
  onSynonymsChanged?: () => void;
};

export const GenreSynonymsPanel = forwardRef<GenreSynonymsPanelHandle, Props>(
  function GenreSynonymsPanel({ onSynonymsChanged }, ref) {
    const { t } = useTranslation("admin");
    const [synonyms, setSynonyms] = useState<GenreSynonyms>({});
    const [loading, setLoading] = useState(true);
    const [keyInput, setKeyInput] = useState("");
    const [valueInput, setValueInput] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [reapplying, setReapplying] = useState(false);
    const keyInputRef = useRef<HTMLInputElement | null>(null);

    useImperativeHandle(ref, () => ({
      promoteLabel(label: string) {
        setKeyInput(label.toLowerCase());
        setValueInput("");
        keyInputRef.current?.focus();
        if (typeof window !== "undefined") {
          keyInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }));

    async function loadSynonyms(): Promise<void> {
      setLoading(true);
      try {
        const data = await getGenreSynonyms();
        setSynonyms(data);
      } catch {
        setMessage(t("synonyms.loadFailed"));
      } finally {
        setLoading(false);
      }
    }

    useEffect(() => { void loadSynonyms(); }, []);

    async function handleAdd(e: FormEvent): Promise<void> {
      e.preventDefault();
      const k = keyInput.trim().toLowerCase();
      const v = valueInput.trim();
      if (!k || !v) return;
      try {
        await putGenreSynonym(k, v);
        setKeyInput("");
        setValueInput("");
        await loadSynonyms();
        onSynonymsChanged?.();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : t("synonyms.saveFailed"));
      }
    }

    async function handleDelete(key: string): Promise<void> {
      try {
        await deleteGenreSynonym(key);
        await loadSynonyms();
        onSynonymsChanged?.();
      } catch { /* best-effort: ignore failures */ }
    }

    async function handleReset(): Promise<void> {
      try {
        await resetGenreSynonyms();
        await loadSynonyms();
        setMessage(t("synonyms.resetDone"));
        onSynonymsChanged?.();
      } catch { /* best-effort: ignore failures */ }
    }

    async function handleReapply(): Promise<void> {
      setReapplying(true);
      setMessage(null);
      try {
        const { scanned, updated } = await reapplyGenreSynonyms();
        setMessage(
          updated > 0
            ? t("synonyms.reapplyResult", { updated, scanned })
            : t("synonyms.reapplyNothing", { scanned })
        );
        onSynonymsChanged?.();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : t("synonyms.reapplyFailed"));
      } finally {
        setReapplying(false);
      }
    }

    const entries = Object.entries(synonyms).sort(([a], [b]) => a.localeCompare(b));

    return (
      <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl text-flaque-ink">{t("synonyms.title")}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => { void handleReapply(); }}
              disabled={reapplying}
            >
              {reapplying ? t("synonyms.reapplying") : t("synonyms.reapply")}
            </button>
            <button
              type="button"
              className="rounded-xl border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream"
              onClick={() => { void handleReset(); }}
            >
              {t("synonyms.resetDefaults")}
            </button>
          </div>
        </div>

        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { void handleAdd(e); }}>
          <label className="text-sm text-flaque-ink">
            {t("synonyms.from")}
            <input
              ref={keyInputRef}
              className="mt-1 block w-40 rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={t("synonyms.fromPlaceholder")}
            />
          </label>
          <label className="text-sm text-flaque-ink">
            {t("synonyms.to")}
            <input
              className="mt-1 block w-40 rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              placeholder={t("synonyms.toPlaceholder")}
            />
          </label>
          <button
            type="submit"
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:opacity-60"
            disabled={!keyInput.trim() || !valueInput.trim()}
          >
            {t("synonyms.add")}
          </button>
        </form>

        {message ? <p className="mt-2 text-xs text-flaque-steel">{message}</p> : null}

        {loading ? (
          <p className="mt-3 text-sm text-flaque-steel">{t("loading")}</p>
        ) : entries.length === 0 ? (
          <p className="mt-3 text-sm text-flaque-steel">{t("synonyms.empty")}</p>
        ) : (
          <div className="mt-3 max-h-60 overflow-y-auto rounded-xl border border-flaque-clay/40">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("synonyms.from")}</th>
                  <th className="px-3 py-2 font-medium">{t("synonyms.to")}</th>
                  <th className="w-16 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {entries.map(([key, value]) => (
                  <tr key={key} className="border-t border-flaque-clay/30">
                    <td className="px-3 py-1.5 text-flaque-ink">{key}</td>
                    <td className="px-3 py-1.5 text-flaque-steel">{value}</td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        className="text-xs text-red-500 hover:text-red-700"
                        onClick={() => { void handleDelete(key); }}
                      >
                        {t("synonyms.delete")}
                      </button>
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
);
