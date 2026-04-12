import { useState } from "react";

import type { LogFile, LogEntry, StorageUsage, SystemStats, VersionInfo, UpdateStatus } from "../api";
import type { SystemStatsDataPoint } from "../hooks/useAdminServer";
import { formatSize } from "../utils/format";

type AdminServerViewProps = {
  versionInfo: VersionInfo | null;
  loadingVersion: boolean;
  updateStatus: UpdateStatus | null;
  onTriggerUpdate: () => Promise<void>;
  onCheckForUpdates: () => Promise<void>;
  storageUsage: StorageUsage | null;
  loadingStorage: boolean;
  systemStats: SystemStats | null;
  systemStatsHistory: SystemStatsDataPoint[];
  loadingSystemStats: boolean;
  logFiles: LogFile[];
  loadingFiles: boolean;
  selectedFile: string | null;
  onFileChange: (file: string) => void;
  entries: LogEntry[];
  loadingEntries: boolean;
  error: string | null;
  total: number;
  levelFilter: number | null;
  onLevelFilterChange: (level: number | null) => void;
  onRefresh: () => Promise<void>;
  onLoadMore: () => Promise<void>;
  hasMore: boolean;
};

function formatLogTime(epochMs: number): { hm: string; s: string; ms: string } {
  const d = new Date(epochMs);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return { hm: `${h}:${m}`, s: `:${s}`, ms: `.${ms}` };
}

function formatLogDate(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleDateString("en-CA");
}

function formatLevelLabel(level: number): string {
  if (level <= 10) return "TRACE";
  if (level <= 20) return "DEBUG";
  if (level <= 30) return "INFO";
  if (level <= 40) return "WARN";
  if (level <= 50) return "ERROR";
  return "FATAL";
}

function levelBadgeClassName(level: number): string {
  if (level <= 20) return "bg-flaque-clay/40 text-flaque-steel";
  if (level <= 30) return "bg-blue-100 text-blue-700";
  if (level <= 40) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function levelTextClassName(level: number): string {
  if (level <= 20) return "text-flaque-steel/70";
  if (level <= 30) return "text-flaque-ink";
  if (level <= 40) return "text-amber-600";
  return "text-red-600";
}

const KNOWN_META_KEYS = new Set(["level", "time", "msg", "context", "pid", "hostname"]);

function extractExtraFields(entry: LogEntry): Record<string, unknown> | null {
  const extra: Record<string, unknown> = {};
  let hasExtra = false;

  for (const [key, value] of Object.entries(entry)) {
    if (!KNOWN_META_KEYS.has(key)) {
      extra[key] = value;
      hasExtra = true;
    }
  }

  return hasExtra ? extra : null;
}

const LEVEL_OPTIONS: Array<[string, number | null]> = [
  ["All levels", null],
  ["Debug+", 20],
  ["Info+", 30],
  ["Warn+", 40],
  ["Error+", 50]
];

const DIR_COLORS = [
  "bg-blue-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-purple-500",
  "bg-rose-400"
];

function MiniAreaChart({ data, color, maxValue = 100 }: { data: number[]; color: string; maxValue?: number }): JSX.Element {
  const w = 200;
  const h = 50;

  if (data.length < 2) {
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-12 w-full rounded-lg" />
    );
  }

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (Math.min(v, maxValue) / maxValue) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylinePoints = points.join(" ");
  const polygonPoints = `0,${h} ${polylinePoints} ${w},${h}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-12 w-full rounded-lg">
      <polygon points={polygonPoints} fill={color} opacity="0.15" />
      <polyline points={polylinePoints} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type SystemStatsSectionProps = {
  systemStats: SystemStats | null;
  history: SystemStatsDataPoint[];
  loading: boolean;
};

function SystemStatsSection({ systemStats, history, loading }: SystemStatsSectionProps): JSX.Element {
  if (loading && !systemStats) {
    return (
      <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">System</h3>
        <p className="mt-2 text-sm text-flaque-steel">Loading...</p>
      </section>
    );
  }

  if (!systemStats) {
    return (
      <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">System</h3>
        <p className="mt-2 text-sm text-flaque-steel">System stats unavailable.</p>
      </section>
    );
  }

  const cpuPercent = systemStats.cpu.usagePercent;
  const memPercent = systemStats.memory.usagePercent;
  const cpuHistory = history.map((p) => p.cpu);
  const memHistory = history.map((p) => p.memory);

  function barColor(percent: number): string {
    if (percent > 90) return "bg-red-500";
    if (percent > 75) return "bg-amber-500";
    return "";
  }

  return (
    <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h3 className="font-display text-xl text-flaque-ink">System</h3>

      <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* CPU */}
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-flaque-ink">CPU</span>
            <span className="text-flaque-steel">
              {cpuPercent.toFixed(1)}%
              {systemStats.cpu.model ? <> &middot; {systemStats.cpu.model}</> : null}
              {" "}&middot; {systemStats.cpu.cores} cores
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-flaque-clay/30">
            <div
              className={`h-full rounded-full transition-all ${barColor(cpuPercent) || "bg-blue-500"}`}
              style={{ width: `${Math.min(cpuPercent, 100)}%` }}
            />
          </div>
          <div className="mt-2">
            <MiniAreaChart data={cpuHistory} color="#3b82f6" />
          </div>
        </div>

        {/* Memory */}
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-flaque-ink">Memory</span>
            <span className="text-flaque-steel">
              {memPercent.toFixed(1)}% &middot; {formatSize(systemStats.memory.used)} / {formatSize(systemStats.memory.total)}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-flaque-clay/30">
            <div
              className={`h-full rounded-full transition-all ${barColor(memPercent) || "bg-emerald-500"}`}
              style={{ width: `${Math.min(memPercent, 100)}%` }}
            />
          </div>
          <div className="mt-2">
            <MiniAreaChart data={memHistory} color="#10b981" />
          </div>
        </div>
      </div>
    </section>
  );
}

function StorageSection({ storageUsage, loading }: { storageUsage: StorageUsage | null; loading: boolean }): JSX.Element {
  if (loading && !storageUsage) {
    return (
      <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">Storage</h3>
        <p className="mt-2 text-sm text-flaque-steel">Loading...</p>
      </section>
    );
  }

  if (!storageUsage) {
    return (
      <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">Storage</h3>
        <p className="mt-2 text-sm text-flaque-steel">Storage information unavailable.</p>
      </section>
    );
  }

  const { disk, directories, totalDataSize } = storageUsage;
  const usedPercent = disk.total > 0 ? (disk.used / disk.total) * 100 : 0;

  return (
    <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h3 className="font-display text-xl text-flaque-ink">Storage</h3>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-flaque-ink">
            {formatSize(disk.used)} used of {formatSize(disk.total)}
          </span>
          <span className="text-flaque-steel">
            {formatSize(disk.free)} free ({(100 - usedPercent).toFixed(1)}%)
          </span>
        </div>

        <div className="mt-2 h-3 overflow-hidden rounded-full bg-flaque-clay/30">
          <div
            className={`h-full rounded-full transition-all ${usedPercent > 90 ? "bg-red-500" : usedPercent > 75 ? "bg-amber-500" : "bg-blue-500"}`}
            style={{ width: `${Math.min(usedPercent, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-flaque-ink">
          Flaque data: {formatSize(totalDataSize)}
        </p>

        <div className="mt-2 space-y-1.5">
          {directories.map((dir, i) => (
            <div key={dir.name} className="flex items-center gap-2 text-sm">
              <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${DIR_COLORS[i % DIR_COLORS.length]}`} />
              <span className="text-flaque-ink">{dir.name}</span>
              <span className="text-flaque-steel/60">{dir.path}</span>
              <span className="ml-auto font-mono text-xs text-flaque-steel">{formatSize(dir.size)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type VersionSectionProps = {
  versionInfo: VersionInfo | null;
  loading: boolean;
  updateStatus: UpdateStatus | null;
  onTriggerUpdate: () => Promise<void>;
  onCheckForUpdates: () => Promise<void>;
};

function VersionSection({ versionInfo, loading, updateStatus, onTriggerUpdate, onCheckForUpdates }: VersionSectionProps): JSX.Element | null {
  const isUpdating = updateStatus?.status === "updating";

  if (loading && !versionInfo) {
    return (
      <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <p className="text-sm text-flaque-steel">Checking for updates...</p>
      </section>
    );
  }

  if (!versionInfo) {
    return null;
  }

  // Update in progress or just completed/failed
  if (isUpdating) {
    return (
      <section className="rounded-xl m-4 border border-amber-200 bg-amber-50/80 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-lg text-amber-900">Updating...</h3>
        <p className="mt-1 text-sm text-amber-700">
          {updateStatus.message ?? "Pulling latest code and rebuilding containers. This may take a few minutes."}
        </p>
      </section>
    );
  }

  if (updateStatus?.status === "complete") {
    return (
      <section className="rounded-xl m-4 border border-emerald-200 bg-emerald-50/80 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-emerald-900">Update complete</h3>
            <p className="mt-1 text-sm text-emerald-700">
              Running v{versionInfo.currentVersion}.
              {updateStatus.message ? ` ${updateStatus.message}.` : ""}
              {" "}Reload the page to get the latest interface.
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      </section>
    );
  }

  if (updateStatus?.status === "failed") {
    return (
      <section className="rounded-xl m-4 border border-red-200 bg-red-50/80 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-lg text-red-900">Update failed</h3>
        <p className="mt-1 text-sm text-red-700">
          {updateStatus.message ?? "The update did not complete successfully. Check the server logs for details."}
        </p>
      </section>
    );
  }

  if (versionInfo.isUpdateAvailable && versionInfo.latestVersion) {
    return (
      <section className="rounded-xl m-4 border border-blue-200 bg-blue-50/80 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-blue-900">
              Update available: v{versionInfo.latestVersion}
            </h3>
            <p className="mt-1 text-sm text-blue-700">
              You are running v{versionInfo.currentVersion}.
              {versionInfo.releaseName ? ` Latest: ${versionInfo.releaseName}.` : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {versionInfo.releaseUrl ? (
              <a
                href={versionInfo.releaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100"
              >
                View release
              </a>
            ) : null}
            <button
              type="button"
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              onClick={() => {
                void onTriggerUpdate();
              }}
            >
              Update now
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 px-5 py-3 shadow-panel backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-flaque-steel">
          Running v{versionInfo.currentVersion}
          {versionInfo.checkedAt
            ? ` — last checked ${new Date(versionInfo.checkedAt).toLocaleString()}`
            : ""}
        </p>
        <button
          type="button"
          className="rounded-lg border border-flaque-clay/60 bg-flaque-cream/80 px-3 py-1.5 text-xs font-medium text-flaque-ink transition hover:bg-flaque-cream disabled:opacity-50"
          disabled={loading}
          onClick={() => { void onCheckForUpdates(); }}
        >
          {loading ? "Checking..." : "Check for updates"}
        </button>
      </div>
    </section>
  );
}

export function AdminServerView({
  versionInfo,
  loadingVersion,
  updateStatus,
  onTriggerUpdate,
  onCheckForUpdates,
  storageUsage,
  loadingStorage,
  systemStats,
  systemStatsHistory,
  loadingSystemStats,
  logFiles,
  loadingFiles,
  selectedFile,
  onFileChange,
  entries,
  loadingEntries,
  error,
  total,
  levelFilter,
  onLevelFilterChange,
  onRefresh,
  onLoadMore,
  hasMore
}: AdminServerViewProps): JSX.Element {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  function toggleExpanded(index: number): void {
    setExpandedIndex(expandedIndex === index ? null : index);
  }

  return (
    <div className="space-y-6">
      <VersionSection
        versionInfo={versionInfo}
        loading={loadingVersion}
        updateStatus={updateStatus}
        onTriggerUpdate={onTriggerUpdate}
        onCheckForUpdates={onCheckForUpdates}
      />
      <SystemStatsSection systemStats={systemStats} history={systemStatsHistory} loading={loadingSystemStats} />
      <StorageSection storageUsage={storageUsage} loading={loadingStorage} />

      <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl text-flaque-ink">Server logs</h3>
            <p className="text-sm text-flaque-steel">
              {loadingEntries
                ? "Loading..."
                : `${entries.length} / ${total} entries`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              value={selectedFile ?? ""}
              onChange={(e) => onFileChange(e.target.value)}
              disabled={loadingFiles}
            >
              {logFiles.length === 0 ? (
                <option value="">No log files</option>
              ) : null}
              {logFiles.map((file) => (
                <option key={file.name} value={file.name}>
                  {file.name} ({formatSize(file.size)})
                </option>
              ))}
            </select>

            <select
              className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              value={levelFilter ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onLevelFilterChange(val ? Number(val) : null);
              }}
            >
              {LEVEL_OPTIONS.map(([label, value]) => (
                <option key={label} value={value ?? ""}>
                  {label}
                </option>
              ))}
            </select>

            <button
              className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                void onRefresh();
              }}
              disabled={loadingEntries || loadingFiles}
            >
              Refresh
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 max-h-[60vh] overflow-auto rounded-2xl border border-flaque-clay/40 bg-flaque-cream/30">
          {entries.length === 0 && !loadingEntries ? (
            <p className="px-4 py-6 text-center text-sm text-flaque-steel">
              No log entries found.
            </p>
          ) : null}

          {entries.map((entry, index) => {
            const extra = extractExtraFields(entry);
            const isExpanded = expandedIndex === index;
            const level = typeof entry.level === "number" ? entry.level : 30;
            const time = typeof entry.time === "number" ? formatLogTime(entry.time) : null;

            const currentDate = typeof entry.time === "number" ? formatLogDate(entry.time) : "";
            const prevEntry = index > 0 ? entries[index - 1] : undefined;
            const prevDate = prevEntry && typeof prevEntry.time === "number" ? formatLogDate(prevEntry.time) : "";
            const showDateSeparator = currentDate !== "" && currentDate !== prevDate;

            return (
              <div key={index}>
                {showDateSeparator ? (
                  <div className="sticky top-0 z-10 flex justify-center py-1.5 md:hidden">
                    <span className="rounded-full bg-flaque-clay/70 px-3 py-0.5 text-[10px] font-medium text-white shadow-sm">
                      {currentDate}
                    </span>
                  </div>
                ) : null}
                <div className="border-b border-flaque-clay/20 last:border-b-0">
                  <button
                    type="button"
                    className={`flex w-full items-start gap-2 px-3 py-1.5 text-left font-mono text-xs transition hover:bg-flaque-cream/60 ${levelTextClassName(level)}`}
                    onClick={() => toggleExpanded(index)}
                  >
                    <span className="shrink-0 text-flaque-steel/60">
                      <span className="hidden md:inline">{currentDate} </span>
                      {time ? time.hm : ""}
                      <span className="hidden md:inline">{time ? `${time.s}${time.ms}` : ""}</span>
                    </span>
                    <span
                      className={`inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${levelBadgeClassName(level)}`}
                    >
                      {formatLevelLabel(level)}
                    </span>
                    {entry.context ? (
                      <span className="hidden shrink-0 text-flaque-steel sm:inline">[{entry.context}]</span>
                    ) : null}
                    <span className="min-w-0 break-all">{entry.msg}</span>
                  </button>

                  {isExpanded && extra ? (
                    <pre className="mx-3 mb-2 overflow-auto rounded-lg bg-flaque-ink/5 px-3 py-2 font-mono text-[11px] text-flaque-steel">
                      {JSON.stringify(extra, null, 2)}
                    </pre>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {hasMore ? (
          <div className="mt-3 text-center">
            <button
              className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                void onLoadMore();
              }}
              disabled={loadingEntries}
            >
              {loadingEntries ? "Loading..." : "Load more"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
