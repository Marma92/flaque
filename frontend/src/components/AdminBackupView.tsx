import { useState } from "react";
import { useTranslation } from "react-i18next";

import { getBackupDownloadUrl } from "../api";
import type { User } from "../types";
import { useAdminBackup } from "../hooks/useAdminBackup";
import { formatDate, formatSize } from "../utils/format";

type AdminBackupViewProps = {
  currentUser: User;
};

function formatBackupId(id: string): string {
  // 20260406_091500 -> 2026-04-06 09:15:00
  const match = id.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (!match) return id;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
}

export function AdminBackupView({ currentUser }: AdminBackupViewProps): JSX.Element {
  const { t } = useTranslation("admin");
  const {
    backups, loadingBackups,
    config, loadingConfig: loadingConfig,
    backupError: error, backupMessage: message,
    creating, restoring,
    onCreateBackup, onDeleteBackup, onRestoreBackup,
    onUpdateConfig, onPurgeExpired: onPurgeExpired,
    refreshBackups: onRefresh
  } = useAdminBackup({ user: currentUser });
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
            <h3 className="font-display text-xl text-flaque-ink">{t("backup.scheduleTitle")}</h3>
            {!loadingConfig && config ? (
              <p className="mt-1 text-sm text-flaque-steel">
                {config.scheduledEnabled
                  ? t("backup.scheduleSummary", { hours: config.intervalHours, days: config.retentionDays })
                  : t("backup.automaticDisabled")}
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
              {t("backup.configure")}
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
              {t("backup.enableAutomatic")}
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-flaque-ink">
                {t("backup.intervalHours")}
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
                {t("backup.retentionDays")}
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
              {t("backup.includeIndex")}
            </label>

            <div className="flex gap-2">
              <button
                className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black"
                type="button"
                onClick={() => { void saveSchedule(); }}
              >
                {t("backup.save")}
              </button>
              <button
                className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream"
                type="button"
                onClick={() => setEditingSchedule(false)}
              >
                {t("backup.cancel")}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Actions */}
      <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">{t("backup.manualTitle")}</h3>
        <p className="mt-1 text-sm text-flaque-steel">
          {config?.includeIndex ? t("backup.manualDescriptionWithIndex") : t("backup.manualDescription")}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => { void onCreateBackup(); }}
            disabled={creating || restoring}
          >
            {creating ? t("backup.creating") : t("backup.createNow")}
          </button>

          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => { void onRefresh(); }}
            disabled={loadingBackups}
          >
            {loadingBackups ? t("backup.refreshing") : t("backup.refresh")}
          </button>

          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={() => { void onPurgeExpired(); }}
            disabled={loadingBackups}
          >
            {t("backup.purgeExpired")}
          </button>
        </div>
      </section>

      {/* Backup list */}
      <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">
          {t("backup.listTitle")}{backups.length > 0 ? ` (${backups.length})` : ""}
        </h3>

        {loadingBackups && backups.length === 0 ? (
          <p className="mt-3 text-sm text-flaque-steel">{t("backup.loading")}</p>
        ) : null}

        {!loadingBackups && backups.length === 0 ? (
          <p className="mt-3 text-sm text-flaque-steel">{t("backup.empty")}</p>
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
                      {backup.trigger === "scheduled" ? t("backup.scheduled") : t("backup.manual")}
                      {" \u00b7 "}
                      {formatSize(backup.sizeBytes)}
                      {" \u00b7 "}
                      {backup.includesDatabase ? "DB" : ""}
                      {backup.includesDatabase && backup.includesIndex ? " + " : ""}
                      {backup.includesIndex ? t("backup.index") : ""}
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
                      {t("backup.download")}
                    </a>

                    {confirmRestoreId === backup.id ? (
                      <div className="flex gap-1">
                        <button
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-600 disabled:opacity-60"
                          type="button"
                          disabled={restoring}
                          onClick={() => {
                            void onRestoreBackup(backup.id).finally(() => setConfirmRestoreId(null));
                          }}
                        >
                          {restoring ? t("backup.restoring") : t("backup.confirmRestore")}
                        </button>
                        <button
                          className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream"
                          type="button"
                          onClick={() => setConfirmRestoreId(null)}
                          disabled={restoring}
                        >
                          {t("backup.cancel")}
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
                        {t("backup.restore")}
                      </button>
                    )}

                    {confirmDeleteId === backup.id ? (
                      <div className="flex gap-1">
                        <button
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
                          type="button"
                          onClick={() => {
                            void onDeleteBackup(backup.id).finally(() => setConfirmDeleteId(null));
                          }}
                        >
                          {t("backup.confirmDelete")}
                        </button>
                        <button
                          className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream"
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          {t("backup.cancel")}
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
                        {t("backup.delete")}
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
