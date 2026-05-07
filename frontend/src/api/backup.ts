import { requestJson, withApiBase } from "./client";

export type BackupConfig = {
  scheduledEnabled: boolean;
  intervalHours: number;
  retentionDays: number;
  includeIndex: boolean;
};

export type BackupEntry = {
  id: string;
  createdAt: string;
  trigger: "manual" | "scheduled";
  includesDatabase: boolean;
  includesIndex: boolean;
  sizeBytes: number;
  files: string[];
};

export async function getBackupConfig(): Promise<BackupConfig> {
  return requestJson<BackupConfig>("/api/backup/config");
}

export async function updateBackupConfig(config: Partial<BackupConfig>): Promise<BackupConfig> {
  return requestJson<BackupConfig>("/api/backup/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config)
  });
}

export async function createBackup(): Promise<BackupEntry> {
  return requestJson<BackupEntry>("/api/backup", { method: "POST" });
}

export async function getBackups(): Promise<BackupEntry[]> {
  const payload = await requestJson<{ backups: BackupEntry[] }>("/api/backups");
  return payload.backups;
}

export async function deleteBackup(id: string): Promise<void> {
  await requestJson<void>(`/api/backups/${encodeURIComponent(id)}`, { method: "DELETE", skipJson: true });
}

export async function restoreBackup(id: string): Promise<{ message: string }> {
  return requestJson<{ message: string }>(`/api/backups/${encodeURIComponent(id)}/restore`, { method: "POST" });
}

export function getBackupDownloadUrl(id: string): string {
  return withApiBase(`/api/backups/${encodeURIComponent(id)}/download`);
}

export async function purgeExpiredBackups(): Promise<{ deleted: number; retentionDays: number }> {
  return requestJson("/api/backups/purge", { method: "POST" });
}
