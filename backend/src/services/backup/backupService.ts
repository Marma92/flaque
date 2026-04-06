import fs from "node:fs/promises";
import path from "node:path";

import Database from "better-sqlite3";

import { requireDb } from "../../auth/dbConnection";
import { ensureDir } from "../../utils/fs";
import { createLogger } from "../../utils/logger";
import {
  backupsRoot,
  configRoot,
  indexFilePath,
  playlistsIndexFilePath,
  metadataOverridesFilePath,
  trackActivityLogFilePath,
  scannerStateFilePath
} from "../../utils/paths";

const log = createLogger("backup");

const BACKUP_CONFIG_FILE = "backup-config.json";
const MANIFEST_FILE = "manifest.json";
const MAX_BACKUPS = 100;

const INDEX_FILES = [
  { source: indexFilePath, name: "library-index.json" },
  { source: playlistsIndexFilePath, name: "playlists-index.json" },
  { source: metadataOverridesFilePath, name: "track-metadata-overrides.json" },
  { source: trackActivityLogFilePath, name: "track-activity-log.json" },
  { source: scannerStateFilePath, name: "scanner-state.json" }
];

export type BackupManifest = {
  id: string;
  createdAt: string;
  trigger: "manual" | "scheduled";
  includesDatabase: boolean;
  includesIndex: boolean;
  sizeBytes: number;
  files: string[];
};

export type BackupConfig = {
  scheduledEnabled: boolean;
  intervalHours: number;
  retentionDays: number;
  includeIndex: boolean;
};

export type BackupEntry = BackupManifest;

const DEFAULT_CONFIG: BackupConfig = {
  scheduledEnabled: false,
  intervalHours: 24,
  retentionDays: 30,
  includeIndex: true
};

function configPath(): string {
  return path.join(configRoot, BACKUP_CONFIG_FILE);
}

export async function readBackupConfig(): Promise<BackupConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<BackupConfig>;
    return {
      scheduledEnabled: typeof parsed.scheduledEnabled === "boolean" ? parsed.scheduledEnabled : DEFAULT_CONFIG.scheduledEnabled,
      intervalHours: typeof parsed.intervalHours === "number" && parsed.intervalHours >= 1 ? parsed.intervalHours : DEFAULT_CONFIG.intervalHours,
      retentionDays: typeof parsed.retentionDays === "number" && parsed.retentionDays >= 1 ? parsed.retentionDays : DEFAULT_CONFIG.retentionDays,
      includeIndex: typeof parsed.includeIndex === "boolean" ? parsed.includeIndex : DEFAULT_CONFIG.includeIndex
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeBackupConfig(config: BackupConfig): Promise<void> {
  const payload = JSON.stringify(config, null, 2) + "\n";
  await fs.writeFile(configPath(), payload, "utf8");
}

function generateBackupId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}${mo}${d}_${h}${mi}${s}`;
}

async function copyFileIfExists(src: string, dest: string): Promise<boolean> {
  try {
    await fs.copyFile(src, dest);
    return true;
  } catch {
    return false;
  }
}

async function getFileSize(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

export async function createBackup(
  trigger: "manual" | "scheduled",
  options?: { includeIndex?: boolean }
): Promise<BackupManifest> {
  const id = generateBackupId();
  const backupDir = path.join(backupsRoot, id);
  await ensureDir(backupDir);

  const files: string[] = [];
  let totalSize = 0;

  // SQLite hot backup using the .backup() API
  const db = requireDb();
  const dbBackupPath = path.join(backupDir, "users.db");
  await db.backup(dbBackupPath);
  files.push("users.db");
  totalSize += await getFileSize(dbBackupPath);

  // Copy index files
  const includeIndex = options?.includeIndex ?? true;
  if (includeIndex) {
    const indexDir = path.join(backupDir, "index");
    await ensureDir(indexDir);

    for (const entry of INDEX_FILES) {
      const dest = path.join(indexDir, entry.name);
      const copied = await copyFileIfExists(entry.source, dest);
      if (copied) {
        files.push(`index/${entry.name}`);
        totalSize += await getFileSize(dest);
      }
    }
  }

  const manifest: BackupManifest = {
    id,
    createdAt: new Date().toISOString(),
    trigger,
    includesDatabase: true,
    includesIndex: includeIndex,
    sizeBytes: totalSize,
    files
  };

  await fs.writeFile(
    path.join(backupDir, MANIFEST_FILE),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  log.info("Backup created", { id, trigger, files: files.length, sizeBytes: totalSize });
  return manifest;
}

export async function listBackups(): Promise<BackupEntry[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(backupsRoot);
  } catch {
    return [];
  }

  const backups: BackupEntry[] = [];

  for (const name of entries) {
    const manifestPath = path.join(backupsRoot, name, MANIFEST_FILE);
    try {
      const raw = await fs.readFile(manifestPath, "utf8");
      const manifest = JSON.parse(raw) as BackupManifest;
      backups.push(manifest);
    } catch {
      // Skip directories without a valid manifest
    }
  }

  backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return backups;
}

export function getBackupDbPath(backupId: string): string | null {
  const safeId = path.basename(backupId);
  const dbPath = path.join(backupsRoot, safeId, "users.db");
  return dbPath;
}

export async function deleteBackup(backupId: string): Promise<boolean> {
  const safeId = path.basename(backupId);
  const backupDir = path.join(backupsRoot, safeId);

  try {
    await fs.rm(backupDir, { recursive: true, force: true });
    log.info("Backup deleted", { id: safeId });
    return true;
  } catch {
    return false;
  }
}

export async function restoreDatabase(backupId: string): Promise<void> {
  const safeId = path.basename(backupId);
  const backupDbPath = path.join(backupsRoot, safeId, "users.db");

  const stat = await fs.stat(backupDbPath);
  if (!stat.isFile()) {
    throw new Error("Backup database file not found");
  }

  // Validate backup database is a valid SQLite file
  const backupDb = new Database(backupDbPath, { readonly: true });
  const tables = backupDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
  const tableNames = new Set(tables.map((t) => t.name));
  backupDb.close();

  if (!tableNames.has("users")) {
    throw new Error("Backup database is invalid: missing users table");
  }

  // Restore by backing up the source file over the live database path
  const db = requireDb();
  const source = new Database(backupDbPath, { readonly: true });
  await source.backup(db.name);
  source.close();

  // Re-apply WAL mode and foreign keys
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  log.info("Database restored from backup", { id: safeId });
}

export async function purgeExpiredBackups(retentionDays: number): Promise<number> {
  const backups = await listBackups();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  for (const backup of backups) {
    const createdMs = new Date(backup.createdAt).getTime();
    if (createdMs < cutoff) {
      const removed = await deleteBackup(backup.id);
      if (removed) {
        deleted++;
      }
    }
  }

  if (deleted > 0) {
    log.info("Purged expired backups", { deleted, retentionDays });
  }

  return deleted;
}

// Scheduled backup management
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function stopBackupScheduler(): void {
  if (schedulerTimer !== null) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    log.info("Backup scheduler stopped");
  }
}

async function runScheduledBackup(): Promise<void> {
  try {
    const config = await readBackupConfig();
    if (!config.scheduledEnabled) {
      return;
    }

    // Enforce max backups
    const existing = await listBackups();
    if (existing.length >= MAX_BACKUPS) {
      await purgeExpiredBackups(config.retentionDays);
    }

    await createBackup("scheduled", { includeIndex: config.includeIndex });
    await purgeExpiredBackups(config.retentionDays);
  } catch (error) {
    log.error("Scheduled backup failed", { error: String(error) });
  }
}

export async function startBackupScheduler(): Promise<void> {
  stopBackupScheduler();

  const config = await readBackupConfig();
  if (!config.scheduledEnabled) {
    return;
  }

  const intervalMs = config.intervalHours * 60 * 60 * 1000;

  schedulerTimer = setInterval(() => {
    void runScheduledBackup();
  }, intervalMs);
  schedulerTimer.unref();

  log.info("Backup scheduler started", { intervalHours: config.intervalHours });
}
