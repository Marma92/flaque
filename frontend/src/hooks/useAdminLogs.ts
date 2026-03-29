import { useEffect, useState } from "react";

import { getLogFiles, getLogEntries, type LogFile, type LogEntry } from "../api";
import type { User } from "../types";

const PAGE_SIZE = 200;

type UseAdminLogsArgs = {
  user: User | null;
};

type UseAdminLogsResult = {
  logFiles: LogFile[];
  loadingFiles: boolean;
  selectedFile: string | null;
  setSelectedFile: (file: string | null) => void;
  entries: LogEntry[];
  loadingEntries: boolean;
  logsError: string | null;
  total: number;
  levelFilter: number | null;
  setLevelFilter: (level: number | null) => void;
  refreshLogs: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
};

export function useAdminLogs({ user }: UseAdminLogsArgs): UseAdminLogsResult {
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [levelFilter, setLevelFilter] = useState<number | null>(null);

  useEffect(() => {
    if (!user || user.role !== "admin") {
      return;
    }

    setLoadingFiles(true);
    getLogFiles()
      .then((files) => {
        setLogFiles(files);
        if (files.length > 0 && !selectedFile) {
          setSelectedFile(files[0].name);
        }
      })
      .catch((error) => {
        setLogsError(error instanceof Error ? error.message : "Failed to load log files");
      })
      .finally(() => {
        setLoadingFiles(false);
      });
  }, [user]);

  useEffect(() => {
    if (!selectedFile || !user || user.role !== "admin") {
      return;
    }

    setLoadingEntries(true);
    setLogsError(null);

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
        setLogsError(error instanceof Error ? error.message : "Failed to load log entries");
      })
      .finally(() => {
        setLoadingEntries(false);
      });
  }, [selectedFile, levelFilter, user]);

  async function refreshLogs(): Promise<void> {
    setLoadingFiles(true);
    setLogsError(null);

    try {
      const files = await getLogFiles();
      setLogFiles(files);
    } catch (error) {
      setLogsError(error instanceof Error ? error.message : "Failed to load log files");
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
      setLogsError(error instanceof Error ? error.message : "Failed to load log entries");
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
      setLogsError(error instanceof Error ? error.message : "Failed to load more entries");
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
    logFiles,
    loadingFiles,
    selectedFile,
    setSelectedFile: handleSetSelectedFile,
    entries,
    loadingEntries,
    logsError,
    total,
    levelFilter,
    setLevelFilter: handleSetLevelFilter,
    refreshLogs,
    loadMore,
    hasMore: entries.length < total
  };
}
