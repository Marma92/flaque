import fs from "node:fs/promises";
import path from "node:path";

import { Router } from "express";

import { requireAdmin, requireAuth } from "../auth/middleware";
import {
  createBackup,
  deleteBackup,
  listBackups,
  readBackupConfig,
  restoreDatabase,
  purgeExpiredBackups,
  startBackupScheduler,
  writeBackupConfig,
  type BackupConfig
} from "../services/backup/backupService";
import { backupsRoot } from "../utils/paths";
import { createLogger } from "../utils/logger";

const log = createLogger("backup-routes");

export function createBackupRouter(): Router {
  const router = Router();

  // GET /backup/config — read schedule configuration
  router.get("/backup/config", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const config = await readBackupConfig();
      res.json(config);
    } catch (error) {
      next(error);
    }
  });

  // PUT /backup/config — update schedule configuration
  router.put("/backup/config", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const body = req.body as Partial<BackupConfig>;
      const current = await readBackupConfig();

      const updated: BackupConfig = {
        scheduledEnabled: typeof body.scheduledEnabled === "boolean" ? body.scheduledEnabled : current.scheduledEnabled,
        intervalHours: typeof body.intervalHours === "number" && body.intervalHours >= 1 ? Math.floor(body.intervalHours) : current.intervalHours,
        retentionDays: typeof body.retentionDays === "number" && body.retentionDays >= 1 ? Math.floor(body.retentionDays) : current.retentionDays,
        includeIndex: typeof body.includeIndex === "boolean" ? body.includeIndex : current.includeIndex
      };

      await writeBackupConfig(updated);
      await startBackupScheduler();

      log.info("Backup configuration updated", {
        scheduledEnabled: updated.scheduledEnabled,
        intervalHours: updated.intervalHours,
        retentionDays: updated.retentionDays
      });

      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  // POST /backup — create a manual backup
  router.post("/backup", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const config = await readBackupConfig();
      const manifest = await createBackup("manual", { includeIndex: config.includeIndex });
      res.status(201).json(manifest);
    } catch (error) {
      next(error);
    }
  });

  // GET /backups — list all backups
  router.get("/backups", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const backups = await listBackups();
      res.json({ backups });
    } catch (error) {
      next(error);
    }
  });

  // GET /backups/:id/download — download the database backup file
  router.get("/backups/:id/download", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const safeId = path.basename(req.params.id ?? "");
      if (!safeId) {
        res.status(400).json({ error: "Backup id is required" });
        return;
      }

      const dbPath = path.join(backupsRoot, safeId, "users.db");
      try {
        await fs.access(dbPath);
      } catch {
        res.status(404).json({ error: "Backup not found" });
        return;
      }

      res.setHeader("Content-Disposition", `attachment; filename="flaque-backup-${safeId}.db"`);
      res.setHeader("Content-Type", "application/octet-stream");
      const content = await fs.readFile(dbPath);
      res.send(content);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /backups/:id — delete a backup
  router.delete("/backups/:id", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const safeId = path.basename(req.params.id ?? "");
      if (!safeId) {
        res.status(400).json({ error: "Backup id is required" });
        return;
      }

      const deleted = await deleteBackup(safeId);
      if (!deleted) {
        res.status(404).json({ error: "Backup not found" });
        return;
      }

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  // POST /backups/:id/restore — restore database from a backup
  router.post("/backups/:id/restore", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const safeId = path.basename(req.params.id ?? "");
      if (!safeId) {
        res.status(400).json({ error: "Backup id is required" });
        return;
      }

      await restoreDatabase(safeId);
      res.json({ message: "Database restored successfully. Active sessions have been preserved from the backup." });
    } catch (error) {
      next(error);
    }
  });

  // POST /backups/purge — manually purge expired backups
  router.post("/backups/purge", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const config = await readBackupConfig();
      const deleted = await purgeExpiredBackups(config.retentionDays);
      res.json({ deleted, retentionDays: config.retentionDays });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
