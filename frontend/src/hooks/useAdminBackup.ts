import { useCallback, useEffect, useState } from "react";

import {
  createBackup,
  deleteBackup,
  getBackupConfig,
  getBackups,
  restoreBackup,
  updateBackupConfig,
  purgeExpiredBackups,
  type BackupConfig,
  type BackupEntry
} from "../api";
import type { User } from "../types";

type UseAdminBackupArgs = {
  user: User | null;
};

type UseAdminBackupResult = {
  backups: BackupEntry[];
  loadingBackups: boolean;
  config: BackupConfig | null;
  loadingConfig: boolean;
  backupError: string | null;
  backupMessage: string | null;
  creating: boolean;
  restoring: boolean;
  onCreateBackup: () => Promise<void>;
  onDeleteBackup: (id: string) => Promise<void>;
  onRestoreBackup: (id: string) => Promise<void>;
  onUpdateConfig: (config: Partial<BackupConfig>) => Promise<void>;
  onPurgeExpired: () => Promise<void>;
  refreshBackups: () => Promise<void>;
};

export function useAdminBackup({ user }: UseAdminBackupArgs): UseAdminBackupResult {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const refresh = useCallback(async () => {
    setLoadingBackups(true);
    try {
      const list = await getBackups();
      setBackups(list);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Failed to load backups");
    } finally {
      setLoadingBackups(false);
    }
  }, []);

  useEffect(() => {
    if (!user || user.role !== "admin") {
      return;
    }

    setLoadingConfig(true);
    getBackupConfig()
      .then(setConfig)
      .catch(() => {})
      .finally(() => setLoadingConfig(false));

    void refresh();
  }, [user, refresh]);

  async function handleCreateBackup(): Promise<void> {
    setCreating(true);
    setBackupError(null);
    setBackupMessage(null);

    try {
      await createBackup();
      setBackupMessage("Backup created successfully.");
      await refresh();
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Failed to create backup");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteBackup(id: string): Promise<void> {
    setBackupError(null);
    setBackupMessage(null);

    try {
      await deleteBackup(id);
      setBackupMessage("Backup deleted.");
      setBackups((prev) => prev.filter((b) => b.id !== id));
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Failed to delete backup");
    }
  }

  async function handleRestoreBackup(id: string): Promise<void> {
    setRestoring(true);
    setBackupError(null);
    setBackupMessage(null);

    try {
      const result = await restoreBackup(id);
      setBackupMessage(result.message);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Failed to restore backup");
    } finally {
      setRestoring(false);
    }
  }

  async function handleUpdateConfig(patch: Partial<BackupConfig>): Promise<void> {
    setBackupError(null);
    setBackupMessage(null);

    try {
      const updated = await updateBackupConfig(patch);
      setConfig(updated);
      setBackupMessage("Backup settings saved.");
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Failed to update backup settings");
    }
  }

  async function handlePurgeExpired(): Promise<void> {
    setBackupError(null);
    setBackupMessage(null);

    try {
      const result = await purgeExpiredBackups();
      setBackupMessage(
        result.deleted > 0
          ? `Purged ${result.deleted} expired backup${result.deleted > 1 ? "s" : ""}.`
          : "No expired backups to purge."
      );
      await refresh();
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Failed to purge backups");
    }
  }

  return {
    backups,
    loadingBackups,
    config,
    loadingConfig,
    backupError,
    backupMessage,
    creating,
    restoring,
    onCreateBackup: handleCreateBackup,
    onDeleteBackup: handleDeleteBackup,
    onRestoreBackup: handleRestoreBackup,
    onUpdateConfig: handleUpdateConfig,
    onPurgeExpired: handlePurgeExpired,
    refreshBackups: refresh
  };
}
