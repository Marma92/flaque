import { useEffect, useState } from "react";

import { getLibrarySettings, patchLibrarySettings, type LibrarySettings } from "../../api";

export function AiRecommendationPanel(): JSX.Element {
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
      setMessage(err instanceof Error ? err.message : "Failed to load library settings.");
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
      setMessage(
        next
          ? "AI recommendation enabled. New uploads will use CLAP; existing tracks will be re-embedded in the background."
          : "AI recommendation disabled. The Python sidecar is no longer required; for-you reverts to the legacy MFCC engine."
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h3 className="font-display text-xl text-flaque-ink">AI recommendation</h3>
      <p className="mt-1 text-sm text-flaque-steel">
        Powers for-you playlists with the local CLAP audio model (~1 GB resident, runs in a Python sidecar).
        Disable on light servers to fall back to the previous engine (32-dim MFCC embeddings via ffmpeg, tag-driven ranker).
        Playlists are recomputed on the next regeneration in either case.
      </p>
      <p className="mt-1 text-xs text-flaque-steel">
        Note: disabling requires <code className="font-mono">ffmpeg</code> on PATH for the MFCC backfill.
        Until backfill completes, embedding similarity is treated as neutral and playlists are picked from genre + year + popularity signals only.
      </p>

      {loading || !settings ? (
        <p className="mt-3 text-sm text-flaque-steel">Loading...</p>
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
              aria-label="Enable AI recommendation"
            />
            <span className="text-sm text-flaque-ink">
              <span className="font-semibold">
                {settings.aiRecommendation ? "Enabled" : "Disabled"}
              </span>
              <span className="block text-xs text-flaque-steel">
                {settings.aiRecommendation
                  ? "Using CLAP (laion/clap-htsat-fused, 512-dim). Requires the audio-embedder sidecar to be running."
                  : "Using legacy MFCC (32-dim). No Python sidecar needed."}
              </span>
            </span>
          </label>

          {message ? <p className="text-sm text-flaque-steel">{message}</p> : null}
        </div>
      )}
    </section>
  );
}
