import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { createLogger } from "../../utils/logger";
import { cacheRoot } from "../../utils/paths";

const log = createLogger("enrichment-log");

const LOG_FILE = path.join(cacheRoot, "musicbrainz-enrichment-log.jsonl");
const MAX_ENTRIES = 1000;
const TRIM_THRESHOLD = 1200; // trim back to MAX_ENTRIES when this is exceeded

export type EnrichmentLogEntry = {
  timestamp: string;
  trackId: string;
  artist: string;
  title: string;
  source: "bulk" | "single" | "upload";
  status: "hit" | "miss" | "skipped" | "failed";
  filledGenre?: string[];
  filledYear?: number;
  filledRecordingMbid?: string;
  filledReleaseGroupMbid?: string;
  filledArtistMbid?: string;
  coverFetched?: boolean;
  errorMessage?: string;
};

let lineCount = -1; // -1 means "not yet counted"

function ensureDirSync(): void {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

function countLinesSync(): number {
  if (!fs.existsSync(LOG_FILE)) return 0;
  try {
    const raw = fs.readFileSync(LOG_FILE, "utf8");
    return raw.split("\n").filter((line) => line.length > 0).length;
  } catch {
    return 0;
  }
}

function trimIfNeeded(): void {
  if (lineCount < TRIM_THRESHOLD) return;
  try {
    const raw = fs.readFileSync(LOG_FILE, "utf8");
    const lines = raw.split("\n").filter((line) => line.length > 0);
    if (lines.length <= MAX_ENTRIES) {
      lineCount = lines.length;
      return;
    }
    const kept = lines.slice(lines.length - MAX_ENTRIES);
    const tmpPath = `${LOG_FILE}.tmp`;
    fs.writeFileSync(tmpPath, `${kept.join("\n")}\n`, "utf8");
    fs.renameSync(tmpPath, LOG_FILE);
    lineCount = kept.length;
  } catch (error) {
    log.warn("Failed to trim enrichment log", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function appendEnrichmentLog(entry: EnrichmentLogEntry): void {
  try {
    ensureDirSync();
    if (lineCount < 0) lineCount = countLinesSync();
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
    lineCount++;
    trimIfNeeded();
  } catch (error) {
    log.warn("Failed to append enrichment log entry", {
      trackId: entry.trackId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function readEnrichmentLog(limit: number): Promise<EnrichmentLogEntry[]> {
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  let raw: string;
  try {
    raw = await fsp.readFile(LOG_FILE, "utf8");
  } catch {
    return [];
  }

  const lines = raw.split("\n").filter((line) => line.length > 0);
  const slice = lines.slice(-safeLimit).reverse();
  const entries: EnrichmentLogEntry[] = [];
  for (const line of slice) {
    try {
      const parsed = JSON.parse(line) as EnrichmentLogEntry;
      if (typeof parsed?.trackId === "string" && typeof parsed?.timestamp === "string") {
        entries.push(parsed);
      }
    } catch {
      // skip malformed line
    }
  }
  return entries;
}

export async function clearEnrichmentLog(): Promise<void> {
  try {
    await fsp.unlink(LOG_FILE);
  } catch {
    // ignore missing file
  }
  lineCount = 0;
}
