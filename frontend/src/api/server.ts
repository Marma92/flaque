import { requestJson } from "./client";

export type SystemStats = {
  cpu: { usagePercent: number; cores: number; model?: string };
  memory: { total: number; used: number; free: number; usagePercent: number };
};

export type VersionInfo = {
  currentVersion: string;
  latestVersion: string | null;
  isUpdateAvailable: boolean;
  releaseUrl: string | null;
  releaseName: string | null;
  publishedAt: string | null;
  checkedAt: string | null;
};

export type UpdateStatus = {
  status: "idle" | "updating" | "complete" | "failed" | "unavailable";
  message?: string;
  timestamp?: string;
};

export async function getSystemStats(): Promise<SystemStats> {
  return requestJson<SystemStats>("/api/logs/system-stats");
}

export async function getVersionInfo(): Promise<VersionInfo> {
  return requestJson<VersionInfo>("/api/server/version");
}

export async function checkForUpdates(): Promise<VersionInfo> {
  return requestJson<VersionInfo>("/api/server/version/check", { method: "POST" });
}

export async function triggerUpdate(): Promise<UpdateStatus> {
  return requestJson<UpdateStatus>("/api/server/update", { method: "POST" });
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  return requestJson<UpdateStatus>("/api/server/update/status");
}
