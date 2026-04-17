import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import {
  clearGenreCache,
  deleteGenreSynonym,
  getAutoPlaylistConfig,
  getEnrichmentStatus,
  getGenreCacheStats,
  getGenreSynonyms,
  patchAutoPlaylistConfig,
  putGenreSynonym,
  regenerateAutoPlaylists,
  resetGenreSynonyms,
  startEnrichment,
  stopEnrichment,
  type AutoPlaylistConfig,
  type EnrichmentStatus,
  type GenreCacheStats,
  type GenreSynonyms
} from "../api";

export function AdminLibraryView(): JSX.Element {
  // ── Genre synonyms ─────────────────────────────────────────────
  const [synonyms, setSynonyms] = useState<GenreSynonyms>({});
  const [loadingSynonyms, setLoadingSynonyms] = useState(true);
  const [synonymKey, setSynonymKey] = useState("");
  const [synonymValue, setSynonymValue] = useState("");
  const [synonymMessage, setSynonymMessage] = useState<string | null>(null);

  // ── Enrichment ─────────────────────────────────────────────────
  const [enrichStatus, setEnrichStatus] = useState<EnrichmentStatus | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cache ──────────────────────────────────────────────────────
  const [cacheStats, setCacheStats] = useState<GenreCacheStats | null>(null);

  // ── Auto-playlist config ───────────────────────────────────────
  const [config, setConfig] = useState<AutoPlaylistConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configMax, setConfigMax] = useState("");
  const [configMin, setConfigMin] = useState("");
  const [configTracks, setConfigTracks] = useState("");
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenMessage, setRegenMessage] = useState<string | null>(null);

  // ── Polling for enrichment status ──────────────────────────────

  const pollEnrichStatus = useCallback(async () => {
    try {
      const status = await getEnrichmentStatus();
      setEnrichStatus(status);
      // Also refresh cache stats while enrichment runs
      if (status.running) {
        const stats = await getGenreCacheStats();
        setCacheStats(stats);
      }
      return status;
    } catch {
      return null;
    }
  }, []);

  function startPolling(): void {
    stopPolling();
    pollRef.current = setInterval(() => { void pollEnrichStatus(); }, 2000);
  }

  function stopPolling(): void {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Start/stop polling based on enrichment running state
  useEffect(() => {
    if (enrichStatus?.running) {
      startPolling();
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [enrichStatus?.running]);

  // ── Initial load ───────────────────────────────────────────────

  useEffect(() => {
    void loadSynonyms();
    void pollEnrichStatus();
    void loadCacheStats();
    void loadConfig();
  }, [pollEnrichStatus]);

  async function loadSynonyms(): Promise<void> {
    setLoadingSynonyms(true);
    try {
      const data = await getGenreSynonyms();
      setSynonyms(data);
    } catch {
      setSynonymMessage("Failed to load synonyms.");
    } finally {
      setLoadingSynonyms(false);
    }
  }

  async function loadCacheStats(): Promise<void> {
    try {
      const stats = await getGenreCacheStats();
      setCacheStats(stats);
    } catch {}
  }

  async function loadConfig(): Promise<void> {
    setLoadingConfig(true);
    try {
      const cfg = await getAutoPlaylistConfig();
      setConfig(cfg);
      setConfigMax(String(cfg.maxPlaylists));
      setConfigMin(String(cfg.minTracksPerPlaylist));
      setConfigTracks(String(cfg.tracksPerPlaylist));
    } catch {} finally {
      setLoadingConfig(false);
    }
  }

  // ── Synonym handlers ───────────────────────────────────────────

  async function handleAddSynonym(e: FormEvent): Promise<void> {
    e.preventDefault();
    const k = synonymKey.trim().toLowerCase();
    const v = synonymValue.trim();
    if (!k || !v) return;
    try {
      await putGenreSynonym(k, v);
      setSynonymKey("");
      setSynonymValue("");
      await loadSynonyms();
    } catch (err) {
      setSynonymMessage(err instanceof Error ? err.message : "Failed to save synonym.");
    }
  }

  async function handleDeleteSynonym(key: string): Promise<void> {
    try {
      await deleteGenreSynonym(key);
      await loadSynonyms();
    } catch {}
  }

  async function handleResetSynonyms(): Promise<void> {
    try {
      await resetGenreSynonyms();
      await loadSynonyms();
      setSynonymMessage("Synonyms reset to defaults.");
    } catch {}
  }

  // ── Enrichment handlers ────────────────────────────────────────

  async function handleToggleEnrichment(): Promise<void> {
    setEnrichLoading(true);
    try {
      if (enrichStatus?.running) {
        await stopEnrichment();
      } else {
        await startEnrichment();
      }
      // Give backend a moment to update, then fetch fresh status
      await new Promise((r) => setTimeout(r, 500));
      const fresh = await pollEnrichStatus();
      // If enrichment just started, polling will be triggered by the state update
      if (fresh && !fresh.running) {
        // Enrichment finished very quickly or was stopped — refresh cache
        await loadCacheStats();
      }
    } catch {} finally {
      setEnrichLoading(false);
    }
  }

  async function handleClearCache(): Promise<void> {
    try {
      await clearGenreCache();
      await loadCacheStats();
    } catch {}
  }

  // ── Config handlers ────────────────────────────────────────────

  async function handleSaveConfig(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSavingConfig(true);
    setConfigMessage(null);
    try {
      const patch: Partial<AutoPlaylistConfig> = {};
      const maxVal = parseInt(configMax);
      const minVal = parseInt(configMin);
      const tracksVal = parseInt(configTracks);
      if (!isNaN(maxVal)) patch.maxPlaylists = maxVal;
      if (!isNaN(minVal)) patch.minTracksPerPlaylist = minVal;
      if (!isNaN(tracksVal)) patch.tracksPerPlaylist = tracksVal;
      const updated = await patchAutoPlaylistConfig(patch);
      setConfig(updated);
      setConfigMessage("Configuration saved.");
    } catch (err) {
      setConfigMessage(err instanceof Error ? err.message : "Failed to save config.");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleRegenerate(): Promise<void> {
    setRegenerating(true);
    setRegenMessage(null);
    try {
      const result = await regenerateAutoPlaylists();
      setRegenMessage(`Regenerated ${result.regenerated} playlist${result.regenerated !== 1 ? "s" : ""}.`);
    } catch (err) {
      setRegenMessage(err instanceof Error ? err.message : "Failed to regenerate.");
    } finally {
      setRegenerating(false);
    }
  }

  const synonymEntries = synonyms ? Object.entries(synonyms).sort(([a], [b]) => a.localeCompare(b)) : [];

  // ── Enrichment progress display ────────────────────────────────
  const enrichPercent = enrichStatus && enrichStatus.total > 0
    ? Math.round((enrichStatus.processed / enrichStatus.total) * 100)
    : 0;

  return (
    <div className="m-4 space-y-4">
      {/* ── Genre Synonyms ──────────────────────────────────────── */}
      <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl text-flaque-ink">Genre Synonyms</h3>
          <button
            type="button"
            className="rounded-xl border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream"
            onClick={() => { void handleResetSynonyms(); }}
          >
            Reset to defaults
          </button>
        </div>

        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { void handleAddSynonym(e); }}>
          <label className="text-sm text-flaque-ink">
            From
            <input
              className="mt-1 block w-40 rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              value={synonymKey}
              onChange={(e) => setSynonymKey(e.target.value)}
              placeholder="e.g. hiphop"
            />
          </label>
          <label className="text-sm text-flaque-ink">
            To
            <input
              className="mt-1 block w-40 rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              value={synonymValue}
              onChange={(e) => setSynonymValue(e.target.value)}
              placeholder="e.g. hip-hop"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:opacity-60"
            disabled={!synonymKey.trim() || !synonymValue.trim()}
          >
            Add
          </button>
        </form>

        {synonymMessage ? <p className="mt-2 text-xs text-flaque-steel">{synonymMessage}</p> : null}

        {loadingSynonyms ? (
          <p className="mt-3 text-sm text-flaque-steel">Loading...</p>
        ) : synonymEntries.length === 0 ? (
          <p className="mt-3 text-sm text-flaque-steel">No synonyms configured.</p>
        ) : (
          <div className="mt-3 max-h-60 overflow-y-auto rounded-xl border border-flaque-clay/40">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
                <tr>
                  <th className="px-3 py-2 font-medium">From</th>
                  <th className="px-3 py-2 font-medium">To</th>
                  <th className="w-16 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {synonymEntries.map(([key, value]) => (
                  <tr key={key} className="border-t border-flaque-clay/30">
                    <td className="px-3 py-1.5 text-flaque-ink">{key}</td>
                    <td className="px-3 py-1.5 text-flaque-steel">{value}</td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        className="text-xs text-red-500 hover:text-red-700"
                        onClick={() => { void handleDeleteSynonym(key); }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Genre Enrichment ────────────────────────────────────── */}
      <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">MusicBrainz Enrichment</h3>
        <p className="mt-1 text-sm text-flaque-steel">
          Enrich tracks missing genre data by looking them up on MusicBrainz.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              enrichStatus?.running
                ? "border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                : "bg-flaque-ink text-flaque-cream hover:bg-black"
            }`}
            onClick={() => { void handleToggleEnrichment(); }}
            disabled={enrichLoading}
          >
            {enrichLoading
              ? "..."
              : enrichStatus?.running
                ? "Stop enrichment"
                : "Start enrichment"}
          </button>
        </div>

        {/* Progress display */}
        {enrichStatus && enrichStatus.running ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-flaque-steel">
              <span>{enrichStatus.processed} / {enrichStatus.total} tracks processed</span>
              <span className="text-flaque-steel/60">({enrichPercent}%)</span>
            </div>
            {enrichStatus.total > 0 ? (
              <div className="h-2 w-full overflow-hidden rounded-full bg-flaque-clay/20">
                <div
                  className="h-full rounded-full bg-flaque-ink transition-all duration-500"
                  style={{ width: `${enrichPercent}%` }}
                />
              </div>
            ) : null}
            <div className="flex gap-3 text-xs text-flaque-steel">
              <span className="text-green-600">{enrichStatus.enriched} enriched</span>
              {enrichStatus.failed > 0 ? (
                <span className="text-red-500">{enrichStatus.failed} failed</span>
              ) : null}
            </div>
          </div>
        ) : enrichStatus && !enrichStatus.running && enrichStatus.processed > 0 ? (
          <div className="mt-3 space-y-1">
            <p className="text-sm text-flaque-steel">
              Last run: {enrichStatus.processed} / {enrichStatus.total} tracks processed
            </p>
            <div className="flex gap-3 text-xs text-flaque-steel">
              <span className="text-green-600">{enrichStatus.enriched} enriched</span>
              {enrichStatus.failed > 0 ? (
                <span className="text-red-500">{enrichStatus.failed} failed</span>
              ) : null}
            </div>
          </div>
        ) : null}

        {cacheStats ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="text-sm text-flaque-steel">
              Cache: {cacheStats.entries} {cacheStats.entries === 1 ? "entry" : "entries"}
            </span>
            <button
              type="button"
              className="rounded-lg border border-flaque-clay px-3 py-1 text-xs text-flaque-ink transition hover:bg-flaque-cream"
              onClick={() => { void handleClearCache(); }}
            >
              Clear cache
            </button>
          </div>
        ) : null}
      </section>

      {/* ── Auto-Playlist Config ────────────────────────────────── */}
      <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">Automatic Playlists</h3>
        <p className="mt-1 text-sm text-flaque-steel">
          Configure how genre/decade playlists are generated.
        </p>

        {loadingConfig ? (
          <p className="mt-3 text-sm text-flaque-steel">Loading...</p>
        ) : (
          <form className="mt-3 space-y-3" onSubmit={(e) => { void handleSaveConfig(e); }}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-sm text-flaque-ink">
                Max playlists
                <input
                  className="mt-1 block w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  type="number"
                  min={0}
                  value={configMax}
                  onChange={(e) => setConfigMax(e.target.value)}
                />
              </label>
              <label className="text-sm text-flaque-ink">
                Min tracks per playlist
                <input
                  className="mt-1 block w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  type="number"
                  min={1}
                  value={configMin}
                  onChange={(e) => setConfigMin(e.target.value)}
                />
              </label>
              <label className="text-sm text-flaque-ink">
                Tracks per playlist
                <input
                  className="mt-1 block w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  type="number"
                  min={1}
                  value={configTracks}
                  onChange={(e) => setConfigTracks(e.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:opacity-60"
                disabled={savingConfig}
              >
                {savingConfig ? "Saving..." : "Save configuration"}
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
    </div>
  );
}
