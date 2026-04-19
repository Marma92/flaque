import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Router } from "express";

import { requireAdmin, requireAuth } from "../auth/middleware";
import { AppError } from "../utils/AppError";
import { backupsRoot, cacheRoot, configRoot, dataRoot, indexRoot, logsRoot, storageRoot } from "../utils/paths";

const LOG_FILE_PATTERN = /^flaque\.(\d{4}-\d{2}-\d{2}\.)?\d+\.log$/;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

function isValidLogFileName(name: string): boolean {
  return LOG_FILE_PATTERN.test(name);
}

function safeResolveLogPath(fileName: string): string | null {
  if (!isValidLogFileName(fileName)) {
    return null;
  }

  const resolved = path.resolve(logsRoot, fileName);
  if (!resolved.startsWith(path.resolve(logsRoot) + path.sep) && resolved !== path.resolve(logsRoot, fileName)) {
    return null;
  }

  return resolved;
}

function parseNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function tryParseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }

    return null;
  } catch {
    return null;
  }
}

async function getDirectorySize(dirPath: string): Promise<number> {
  let total = 0;

  let dirEntries: string[];
  try {
    dirEntries = await fs.readdir(dirPath);
  } catch {
    return 0;
  }

  for (const name of dirEntries) {
    const fullPath = path.join(dirPath, name);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        total += await getDirectorySize(fullPath);
      } else if (stat.isFile()) {
        total += stat.size;
      }
    } catch {
      // skip inaccessible entries
    }
  }

  return total;
}

type CpuTimeSample = { idle: number; total: number };

let previousCpuSample: CpuTimeSample | null = null;

function sampleCpuTimes(): CpuTimeSample {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

const STORAGE_DIRECTORIES = [
  { name: "Music", path: "storage/", root: storageRoot },
  { name: "Cache", path: "cache/", root: cacheRoot },
  { name: "Index", path: "index/", root: indexRoot },
  { name: "Logs", path: "logs/", root: logsRoot },
  { name: "Config", path: "config/", root: configRoot },
  { name: "Backups", path: "backups/", root: backupsRoot }
] as const;

export function createLogRouter(): Router {
  const router = Router();

  router.get("/logs/files", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const dirEntries = await fs.readdir(logsRoot, { withFileTypes: true }).catch(() => []);
      const files: Array<{ name: string; size: number; modifiedAt: string }> = [];

      for (const entry of dirEntries) {
        if (!entry.isFile() || !isValidLogFileName(entry.name)) {
          continue;
        }

        const stat = await fs.stat(path.join(logsRoot, entry.name));
        files.push({
          name: entry.name,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString()
        });
      }

      files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
      res.json({ files });
    } catch (error) {
      next(error);
    }
  });

  router.get("/logs/entries", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const fileName = typeof req.query.file === "string" ? req.query.file : "";
      const filePath = safeResolveLogPath(fileName);

      if (!filePath) {
        return next(new AppError("Invalid log file name", 400));
      }

      let content: string;
      try {
        content = await fs.readFile(filePath, "utf8");
      } catch {
        res.json({ file: fileName, total: 0, offset: 0, limit: DEFAULT_LIMIT, entries: [] });
        return;
      }

      let lines = content.split("\n").filter((line) => line.trim().length > 0);
      lines.reverse();

      let entries = lines.map(tryParseJsonLine).filter((entry): entry is Record<string, unknown> => entry !== null);

      const levelParam = req.query.level !== undefined ? Number(req.query.level) : null;
      if (levelParam !== null && Number.isFinite(levelParam)) {
        entries = entries.filter((entry) => typeof entry.level === "number" && entry.level >= levelParam);
      }

      const total = entries.length;
      const offset = parseNonNegativeInt(req.query.offset, 0);
      const limit = Math.min(parseNonNegativeInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);

      const paged = entries.slice(offset, offset + limit);

      res.json({ file: fileName, total, offset, limit, entries: paged });
    } catch (error) {
      next(error);
    }
  });

  router.get("/logs/storage", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const fsStats = await fs.statfs(storageRoot);
      const blockSize = fsStats.bsize;
      const diskTotal = fsStats.blocks * blockSize;
      const diskFree = fsStats.bavail * blockSize;

      const directories = await Promise.all(
        STORAGE_DIRECTORIES.map(async (dir) => ({
          name: dir.name,
          path: dir.path,
          size: await getDirectorySize(dir.root)
        }))
      );

      const totalDataSize = directories.reduce((sum, d) => sum + d.size, 0);

      res.json({
        disk: {
          total: diskTotal,
          free: diskFree,
          used: diskTotal - diskFree
        },
        directories,
        totalDataSize
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/logs/system-stats", requireAuth, requireAdmin, (_req, res) => {
    const currentSample = sampleCpuTimes();
    let cpuUsagePercent = 0;

    if (previousCpuSample) {
      const idleDelta = currentSample.idle - previousCpuSample.idle;
      const totalDelta = currentSample.total - previousCpuSample.total;
      cpuUsagePercent = totalDelta > 0
        ? Math.round((1 - idleDelta / totalDelta) * 1000) / 10
        : 0;
    }

    previousCpuSample = currentSample;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const cpus = os.cpus();
    const rawCpuModel = cpus[0]?.model;
    const cpuModel = rawCpuModel ? rawCpuModel.replace(/\s+/g, " ").trim() : undefined;

    res.json({
      cpu: {
        usagePercent: cpuUsagePercent,
        cores: cpus.length,
        model: cpuModel
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usagePercent: Math.round((usedMem / totalMem) * 1000) / 10
      }
    });
  });

  return router;
}
