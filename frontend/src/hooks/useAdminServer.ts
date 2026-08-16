import { useCallback, useEffect, useRef, useState } from "react";

import {
  getLogFiles, getLogEntries, getStorageUsage, getVersionInfo, checkForUpdates as apiCheckForUpdates, triggerUpdate, getUpdateStatus, getSystemStats,
  type LogFile, type LogEntry, type StorageUsage, type VersionInfo, type UpdateStatus, type SystemStats
} from "../api";
import type { User } from "../types";

const PAGE_SIZE = 200;
const UPDATE_POLL_INTERVAL_MS = 3_000;
const UPDATE_POLL_TIMEOUT_MS = 180_000;
const SYSTEM_STATS_INTERVAL_MS = 10_000;
const SYSTEM_STATS_MAX_HISTORY = 30;

export type SystemStatsDataPoint = {
  cpu: number;
  memory: number;
  timestamp: number;
};

type UseAdminServerArgs = {
  user: User | null;
};

type UseAdminServerResult = {
  storageUsage: StorageUsage | null;
  loadingStorage: boolean;
  systemStats: SystemStats | null;
  systemStatsHistory: SystemStatsDataPoint[];
  loadingSystemStats: boolean;
  versionInfo: VersionInfo | null;
  loadingVersion: boolean;
  updateStatus: UpdateStatus | null;
  onTriggerUpdate: () => Promise<void>;
  onCheckForUpdates: () => Promise<void>;
  logFiles: LogFile[];
  loadingFiles: boolean;
  selectedFile: string | null;
  setSelectedFile: (file: string | null) => void;
  entries: LogEntry[];
  loadingEntries: boolean;
  serverError: string | null;
  total: number;
  levelFilter: number | null;
  setLevelFilter: (level: number | null) => void;
  refreshServer: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
};

export function useAdminServer({ user }: UseAdminServerArgs): UseAdminServerResult {
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loadingVersion, setLoadingVersion] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [levelFilter, setLevelFilter] = useState<number | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [systemStatsHistory, setSystemStatsHistory] = useState<SystemStatsDataPoint[]>([]);
  const [loadingSystemStats, setLoadingSystemStats] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const previousVersionRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    if (versionInfo?.currentVersion) {
      previousVersionRef.current = versionInfo.currentVersion;
    }
  }, [versionInfo]);

  useEffect(() => {
    if (!user || user.role !== "admin") {
      return;
    }

    setLoadingFiles(true);
    setLoadingStorage(true);
    setLoadingVersion(true);

    getVersionInfo()
      .then(setVersionInfo)
      .catch(() => {})
      .finally(() => {
        setLoadingVersion(false);
      });

    getLogFiles()
      .then((files) => {
        setLogFiles(files);
        if (files.length > 0 && !selectedFile) {
          setSelectedFile(files[0]!.name);
        }
      })
      .catch((error) => {
        setServerError(error instanceof Error ? error.message : "Failed to load log files");
      })
      .finally(() => {
        setLoadingFiles(false);
      });

    getStorageUsage()
      .then(setStorageUsage)
      .catch(() => {})
      .finally(() => {
        setLoadingStorage(false);
      });
  }, [user]);

  // System stats polling (10s interval)
  useEffect(() => {
    if (!user || user.role !== "admin") {
      return;
    }

    let cancelled = false;

    async function fetchStats(): Promise<void> {
      try {
        const stats = await getSystemStats();
        if (cancelled) return;
        setSystemStats(stats);
        setSystemStatsHistory((prev) => {
          const point: SystemStatsDataPoint = {
            cpu: stats.cpu.usagePercent,
            memory: stats.memory.usagePercent,
            timestamp: Date.now()
          };
          const next = [...prev, point];
          return next.length > SYSTEM_STATS_MAX_HISTORY ? next.slice(-SYSTEM_STATS_MAX_HISTORY) : next;
        });
      } catch {
        // ignore fetch errors
      } finally {
        if (!cancelled) setLoadingSystemStats(false);
      }
    }

    setLoadingSystemStats(true);
    void fetchStats();

    const timer = setInterval(() => { void fetchStats(); }, SYSTEM_STATS_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user]);

  useEffect(() => {
    if (!selectedFile || !user || user.role !== "admin") {
      return;
    }

    setLoadingEntries(true);
    setServerError(null);

    getLogEntries({
      file: selectedFile,
      limit: PAGE_SIZE,
      offset: 0,
      level: levelFilter ?? undefined
    })
      .then((result) => {
        setEntries(result.entries);
        setTotal(result.total);
      })
      .catch((error) => {
        setServerError(error instanceof Error ? error.message : "Failed to load log entries");
      })
      .finally(() => {
        setLoadingEntries(false);
      });
  }, [selectedFile, levelFilter, user]);

  function startUpdatePolling(): void {
    stopPolling();
    pollStartRef.current = Date.now();

    pollTimerRef.current = setInterval(async () => {
      const elapsed = Date.now() - pollStartRef.current;

      if (elapsed > UPDATE_POLL_TIMEOUT_MS) {
        stopPolling();
        setUpdateStatus({ status: "failed", message: "Update timed out — check server logs" });
        return;
      }

      try {
        // Try the version endpoint first — if the backend is back, it's healthy
        const newVersion = await getVersionInfo();
        setVersionInfo(newVersion);

        // Also check update status from the updater sidecar
        const status = await getUpdateStatus();
        setUpdateStatus(status);

        if (status.status === "complete" || status.status === "idle") {
          stopPolling();
        } else if (status.status === "failed") {
          stopPolling();
        }
      } catch {
        // Backend is likely restarting — keep polling
        setUpdateStatus({ status: "updating", message: "Server is restarting..." });
      }
    }, UPDATE_POLL_INTERVAL_MS);
  }

  async function handleTriggerUpdate(): Promise<void> {
    try {
      const result = await triggerUpdate();
      setUpdateStatus(result);

      if (result.status === "updating") {
        startUpdatePolling();
      }
    } catch (error) {
      setUpdateStatus({
        status: "failed",
        message: error instanceof Error ? error.message : "Failed to trigger update"
      });
    }
  }

  async function checkForUpdates(): Promise<void> {
    setLoadingVersion(true);
    try {
      const info = await apiCheckForUpdates();
      setVersionInfo(info);
    } catch {
      // ignore
    } finally {
      setLoadingVersion(false);
    }
  }

  async function refreshServer(): Promise<void> {
    setLoadingFiles(true);
    setLoadingStorage(true);
    setLoadingVersion(true);
    setServerError(null);

    getVersionInfo()
      .then(setVersionInfo)
      .catch(() => {})
      .finally(() => {
        setLoadingVersion(false);
      });

    getStorageUsage()
      .then(setStorageUsage)
      .catch(() => {})
      .finally(() => {
        setLoadingStorage(false);
      });

    try {
      const files = await getLogFiles();
      setLogFiles(files);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Failed to load log files");
    } finally {
      setLoadingFiles(false);
    }

    if (!selectedFile) {
      return;
    }

    setLoadingEntries(true);

    try {
      const result = await getLogEntries({
        file: selectedFile,
        limit: PAGE_SIZE,
        offset: 0,
        level: levelFilter ?? undefined
      });
      setEntries(result.entries);
      setTotal(result.total);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Failed to load log entries");
    } finally {
      setLoadingEntries(false);
    }
  }

  async function loadMore(): Promise<void> {
    if (!selectedFile || loadingEntries) {
      return;
    }

    setLoadingEntries(true);

    try {
      const result = await getLogEntries({
        file: selectedFile,
        limit: PAGE_SIZE,
        offset: entries.length,
        level: levelFilter ?? undefined
      });
      setEntries((prev) => [...prev, ...result.entries]);
      setTotal(result.total);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Failed to load more entries");
    } finally {
      setLoadingEntries(false);
    }
  }

  function handleSetSelectedFile(file: string | null): void {
    setSelectedFile(file);
    setEntries([]);
    setTotal(0);
  }

  function handleSetLevelFilter(level: number | null): void {
    setLevelFilter(level);
    setEntries([]);
    setTotal(0);
  }

  return {
    storageUsage,
    loadingStorage,
    systemStats,
    systemStatsHistory,
    loadingSystemStats,
    versionInfo,
    loadingVersion,
    updateStatus,
    onTriggerUpdate: handleTriggerUpdate,
    onCheckForUpdates: checkForUpdates,
    logFiles,
    loadingFiles,
    selectedFile,
    setSelectedFile: handleSetSelectedFile,
    entries,
    loadingEntries,
    serverError,
    total,
    levelFilter,
    setLevelFilter: handleSetLevelFilter,
    refreshServer,
    loadMore,
    hasMore: entries.length < total
  };
}
