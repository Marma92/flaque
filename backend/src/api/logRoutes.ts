import fs from "node:fs/promises";
import path from "node:path";

import { Router } from "express";

import { requireAdmin, requireAuth } from "../auth/middleware";
import { logsRoot } from "../utils/paths";

const LOG_FILE_PATTERN = /^flaque\.log(\.\d{4}-\d{2}-\d{2}\.\d+)?$/;
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
        res.status(400).json({ error: "Invalid log file name" });
        return;
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

  return router;
}
