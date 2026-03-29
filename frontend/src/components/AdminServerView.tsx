import { useState } from "react";

import type { LogFile, LogEntry, StorageUsage } from "../api";

type AdminServerViewProps = {
  storageUsage: StorageUsage | null;
  loadingStorage: boolean;
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatLogTime(epochMs: number): string {
  const d = new Date(epochMs);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
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

function StorageSection({ storageUsage, loading }: { storageUsage: StorageUsage | null; loading: boolean }): JSX.Element {
  if (loading && !storageUsage) {
    return (
      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">Storage</h3>
        <p className="mt-2 text-sm text-flaque-steel">Loading...</p>
      </section>
    );
  }

  if (!storageUsage) {
    return (
      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">Storage</h3>
        <p className="mt-2 text-sm text-flaque-steel">Storage information unavailable.</p>
      </section>
    );
  }

  const { disk, directories, totalDataSize } = storageUsage;
  const usedPercent = disk.total > 0 ? (disk.used / disk.total) * 100 : 0;

  return (
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
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

export function AdminServerView({
  storageUsage,
  loadingStorage,
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
      <StorageSection storageUsage={storageUsage} loading={loadingStorage} />

      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
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

            return (
              <div key={index} className="border-b border-flaque-clay/20 last:border-b-0">
                <button
                  type="button"
                  className={`flex w-full items-start gap-2 px-3 py-1.5 text-left font-mono text-xs transition hover:bg-flaque-cream/60 ${levelTextClassName(level)}`}
                  onClick={() => toggleExpanded(index)}
                >
                  <span className="shrink-0 text-flaque-steel/60">
                    {typeof entry.time === "number" ? formatLogDate(entry.time) : ""}{" "}
                    {typeof entry.time === "number" ? formatLogTime(entry.time) : ""}
                  </span>
                  <span
                    className={`inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${levelBadgeClassName(level)}`}
                  >
                    {formatLevelLabel(level)}
                  </span>
                  {entry.context ? (
                    <span className="shrink-0 text-flaque-steel">[{entry.context}]</span>
                  ) : null}
                  <span className="min-w-0 break-all">{entry.msg}</span>
                </button>

                {isExpanded && extra ? (
                  <pre className="mx-3 mb-2 overflow-auto rounded-lg bg-flaque-ink/5 px-3 py-2 font-mono text-[11px] text-flaque-steel">
                    {JSON.stringify(extra, null, 2)}
                  </pre>
                ) : null}
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
