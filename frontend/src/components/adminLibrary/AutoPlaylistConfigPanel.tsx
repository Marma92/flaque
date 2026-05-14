import { FormEvent, useEffect, useState } from "react";

import {
  getAutoPlaylistConfig,
  patchAutoPlaylistConfig,
  regenerateAutoPlaylists,
  type AutoPlaylistConfig
} from "../../api";

type Props = {
  onAutoPlaylistsRegenerated?: () => void;
};

export function AutoPlaylistConfigPanel({ onAutoPlaylistsRegenerated }: Props): JSX.Element {
  const [config, setConfig] = useState<AutoPlaylistConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [maxField, setMaxField] = useState("");
  const [minField, setMinField] = useState("");
  const [tracksField, setTracksField] = useState("");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [regenMessage, setRegenMessage] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const cfg = await getAutoPlaylistConfig();
      setConfig(cfg);
      setMaxField(String(cfg.maxPlaylists));
      setMinField(String(cfg.minTracksPerPlaylist));
      setTracksField(String(cfg.tracksPerPlaylist));
    } catch {} finally {
      setLoading(false);
    }
  }

  async function handleSave(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSaving(true);
    setConfigMessage(null);
    try {
      const patch: Partial<AutoPlaylistConfig> = {};
      const maxVal = parseInt(maxField);
      const minVal = parseInt(minField);
      const tracksVal = parseInt(tracksField);
      if (!isNaN(maxVal)) patch.maxPlaylists = maxVal;
      if (!isNaN(minVal)) patch.minTracksPerPlaylist = minVal;
      if (!isNaN(tracksVal)) patch.tracksPerPlaylist = tracksVal;
      const updated = await patchAutoPlaylistConfig(patch);
      setConfig(updated);
      setConfigMessage("Configuration saved.");
    } catch (err) {
      setConfigMessage(err instanceof Error ? err.message : "Failed to save config.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate(): Promise<void> {
    setRegenerating(true);
    setRegenMessage(null);
    try {
      const result = await regenerateAutoPlaylists();
      setRegenMessage(`Regenerated ${result.regenerated} playlist${result.regenerated !== 1 ? "s" : ""}.`);
      onAutoPlaylistsRegenerated?.();
    } catch (err) {
      setRegenMessage(err instanceof Error ? err.message : "Failed to regenerate.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h3 className="font-display text-xl text-flaque-ink">Automatic Playlists</h3>
      <p className="mt-1 text-sm text-flaque-steel">
        Configure how genre/decade playlists are generated.
      </p>

      {loading || !config ? (
        <p className="mt-3 text-sm text-flaque-steel">Loading...</p>
      ) : (
        <form className="mt-3 space-y-3" onSubmit={(e) => { void handleSave(e); }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-sm text-flaque-ink">
              Max playlists
              <input
                className="mt-1 block w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="number"
                min={0}
                value={maxField}
                onChange={(e) => setMaxField(e.target.value)}
              />
            </label>
            <label className="text-sm text-flaque-ink">
              Min tracks per playlist
              <input
                className="mt-1 block w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="number"
                min={1}
                value={minField}
                onChange={(e) => setMinField(e.target.value)}
              />
            </label>
            <label className="text-sm text-flaque-ink">
              Tracks per playlist
              <input
                className="mt-1 block w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="number"
                min={1}
                value={tracksField}
                onChange={(e) => setTracksField(e.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save configuration"}
            </button>
            <button
              type="button"
              className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:opacity-60"
              onClick={() => { void handleRegenerate(); }}
              disabled={regenerating}
            >
              {regenerating ? "Regenerating..." : "Regenerate now"}
            </button>
          </div>

          {configMessage ? <p className="text-sm text-flaque-steel">{configMessage}</p> : null}
          {regenMessage ? <p className="text-sm text-flaque-steel">{regenMessage}</p> : null}
        </form>
      )}
    </section>
  );
}
