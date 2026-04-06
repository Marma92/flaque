import { useState } from "react";

import type { BackupConfig, BackupEntry } from "../api";
import { getBackupDownloadUrl } from "../api";

type AdminBackupViewProps = {
  backups: BackupEntry[];
  loadingBackups: boolean;
  config: BackupConfig | null;
  loadingConfig: boolean;
  error: string | null;
  message: string | null;
  creating: boolean;
  restoring: boolean;
  onCreateBackup: () => Promise<void>;
  onDeleteBackup: (id: string) => Promise<void>;
  onRestoreBackup: (id: string) => Promise<void>;
  onUpdateConfig: (config: Partial<BackupConfig>) => Promise<void>;
  onPurgeExpired: () => Promise<void>;
  onRefresh: () => Promise<void>;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString();
}

function formatBackupId(id: string): string {
  // 20260406_091500 -> 2026-04-06 09:15:00
  const match = id.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (!match) return id;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
}

export function AdminBackupView({
  backups,
  loadingBackups,
  config,
  loadingConfig,
  error,
  message,
  creating,
  restoring,
  onCreateBackup,
  onDeleteBackup,
  onRestoreBackup,
  onUpdateConfig,
  onPurgeExpired,
  onRefresh
}: AdminBackupViewProps): JSX.Element {
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(config?.scheduledEnabled ?? false);
  const [intervalHours, setIntervalHours] = useState(String(config?.intervalHours ?? 24));
  const [retentionDays, setRetentionDays] = useState(String(config?.retentionDays ?? 30));
  const [includeIndex, setIncludeIndex] = useState(config?.includeIndex ?? true);

  function startEditSchedule(): void {
    if (!config) return;
    setScheduleEnabled(config.scheduledEnabled);
    setIntervalHours(String(config.intervalHours));
    setRetentionDays(String(config.retentionDays));
    setIncludeIndex(config.includeIndex);
    setEditingSchedule(true);
  }

  async function saveSchedule(): Promise<void> {
    await onUpdateConfig({
      scheduledEnabled: scheduleEnabled,
      intervalHours: Math.max(1, parseInt(intervalHours, 10) || 24),
      retentionDays: Math.max(1, parseInt(retentionDays, 10) || 30),
      includeIndex
    });
    setEditingSchedule(false);
  }

  return (
    <div className="space-y-4 p-4">
      {error ? (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {message ? (
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
          {message}
        </p>
      ) : null}

      {/* Schedule configuration */}
      <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl text-flaque-ink">Backup schedule</h3>
            {!loadingConfig && config ? (
              <p className="mt-1 text-sm text-flaque-steel">
                {config.scheduledEnabled
                  ? `Automatic every ${config.intervalHours}h, ${config.retentionDays}-day retention`
                  : "Automatic backups disabled"}
              </p>
            ) : null}
          </div>

          {!editingSchedule ? (
            <button
              className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={startEditSchedule}
              disabled={loadingConfig || !config}
            >
              Configure
            </button>
          ) : null}
        </div>

        {editingSchedule ? (
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm text-flaque-ink">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-flaque-clay text-flaque-ink"
              />
              Enable automatic backups
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-flaque-ink">
                Interval (hours)
                <input
                  className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  type="number"
                  min="1"
                  max="720"
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(e.target.value)}
                />
              </label>

              <label className="block text-sm text-flaque-ink">
                Retention (days)
                <input
                  className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  type="number"
                  min="1"
                  max="365"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(e.target.value)}
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-flaque-ink">
              <input
                type="checkbox"
                checked={includeIndex}
                onChange={(e) => setIncludeIndex(e.target.checked)}
                className="h-4 w-4 rounded border-flaque-clay text-flaque-ink"
              />
              Include library index files in backups
            </label>

            <div className="flex gap-2">
              <button
                className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black"
                type="button"
                onClick={() => { void saveSchedule(); }}
              >
                Save
              </button>
              <button
                className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream"
                type="button"
                onClick={() => setEditingSchedule(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Actions */}
      <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">Manual backup</h3>
        <p className="mt-1 text-sm text-flaque-steel">
          Create a snapshot of the user database{config?.includeIndex ? " and library index" : ""}.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => { void onCreateBackup(); }}
            disabled={creating || restoring}
          >
            {creating ? "Creating backup..." : "Create backup now"}
          </button>

          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => { void onRefresh(); }}
            disabled={loadingBackups}
          >
            {loadingBackups ? "Refreshing..." : "Refresh"}
          </button>

          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => { void onPurgeExpired(); }}
            disabled={loadingBackups}
          >
            Purge expired
          </button>
        </div>
      </section>

      {/* Backup list */}
      <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">
          Backups{backups.length > 0 ? ` (${backups.length})` : ""}
        </h3>

        {loadingBackups && backups.length === 0 ? (
          <p className="mt-3 text-sm text-flaque-steel">Loading backups...</p>
        ) : null}

        {!loadingBackups && backups.length === 0 ? (
          <p className="mt-3 text-sm text-flaque-steel">No backups yet. Create one above.</p>
        ) : null}

        {backups.length > 0 ? (
          <div className="mt-4 space-y-3">
            {backups.map((backup) => (
              <article
                key={backup.id}
                className="rounded-2xl border border-flaque-clay/60 bg-flaque-cream/45 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-flaque-ink">
                      {formatBackupId(backup.id)}
                    </p>
                    <p className="mt-0.5 text-xs text-flaque-steel">
                      {backup.trigger === "scheduled" ? "Scheduled" : "Manual"}
                      {" \u00b7 "}
                      {formatSize(backup.sizeBytes)}
                      {" \u00b7 "}
                      {backup.includesDatabase ? "DB" : ""}
                      {backup.includesDatabase && backup.includesIndex ? " + " : ""}
                      {backup.includesIndex ? "Index" : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-flaque-steel/70">
                      {formatDate(backup.createdAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={getBackupDownloadUrl(backup.id)}
                      className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream"
                      download
                    >
                      Download
                    </a>

                    {confirmRestoreId === backup.id ? (
                      <div className="flex gap-1">
                        <button
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-600 disabled:opacity-60"
                          type="button"
                          disabled={restoring}
                          onClick={() => {
                            void onRestoreBackup(backup.id).then(() => setConfirmRestoreId(null));
                          }}
                        >
                          {restoring ? "Restoring..." : "Confirm restore"}
                        </button>
                        <button
                          className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream"
                          type="button"
                          onClick={() => setConfirmRestoreId(null)}
                          disabled={restoring}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
                        type="button"
                        disabled={restoring || creating}
                        onClick={() => {
                          setConfirmRestoreId(backup.id);
                          setConfirmDeleteId(null);
                        }}
                      >
                        Restore
                      </button>
                    )}

                    {confirmDeleteId === backup.id ? (
                      <div className="flex gap-1">
                        <button
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
                          type="button"
                          onClick={() => {
                            void onDeleteBackup(backup.id).then(() => setConfirmDeleteId(null));
                          }}
                        >
                          Confirm delete
                        </button>
                        <button
                          className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream"
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-50"
                        type="button"
                        disabled={restoring}
                        onClick={() => {
                          setConfirmDeleteId(backup.id);
                          setConfirmRestoreId(null);
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
