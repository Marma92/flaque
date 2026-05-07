import { requestJson } from "./client";

export type LogFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

export type LogEntry = {
  level: number;
  time: number;
  msg: string;
  context?: string;
  [key: string]: unknown;
};

export type StorageUsage = {
  disk: { total: number; free: number; used: number };
  directories: Array<{ name: string; path: string; size: number }>;
  totalDataSize: number;
};

export async function getStorageUsage(): Promise<StorageUsage> {
  return requestJson<StorageUsage>("/api/logs/storage");
}

export async function getLogFiles(): Promise<LogFile[]> {
  const payload = await requestJson<{ files: LogFile[] }>("/api/logs/files");
  return payload.files;
}

export async function getLogEntries(params: {
  file: string;
  limit?: number;
  offset?: number;
  level?: number;
}): Promise<{
  file: string;
  total: number;
  offset: number;
  limit: number;
  entries: LogEntry[];
}> {
  const searchParams = new URLSearchParams();
  searchParams.set("file", params.file);
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params.level !== undefined) searchParams.set("level", String(params.level));
  return requestJson(`/api/logs/entries?${searchParams.toString()}`);
}
