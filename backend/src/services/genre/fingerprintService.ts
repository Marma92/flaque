import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { createLogger } from "../../utils/logger";
import { cacheRoot } from "../../utils/paths";

const log = createLogger("fingerprint");

const CACHE_FILE = path.join(cacheRoot, "track-fingerprints.json");
const CACHE_FLUSH_DEBOUNCE_MS = 500;
const FPCALC_TIMEOUT_MS = 30_000;

function getFpcalcPath(): string {
  return (process.env.FPCALC_PATH ?? "fpcalc").trim() || "fpcalc";
}

export type FingerprintEntry = {
  fingerprint: string;
  duration: number;
  mtimeMs: number;
  size: number;
  computedAt: number;
};

type FingerprintCache = Record<string, FingerprintEntry>;

let cache: FingerprintCache | null = null;
let cacheDirty = false;
let saveTimer: NodeJS.Timeout | null = null;
let fpcalcAvailable: boolean | null = null;

function loadCache(): FingerprintCache {
  if (cache) return cache;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const cleaned: FingerprintCache = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (
          value &&
          typeof value === "object" &&
          typeof (value as FingerprintEntry).fingerprint === "string" &&
          typeof (value as FingerprintEntry).duration === "number"
        ) {
          cleaned[key] = value as FingerprintEntry;
        }
      }
      cache = cleaned;
      return cache;
    }
  } catch {
    log.warn("Failed to load fingerprint cache, starting fresh");
  }
  cache = {};
  return cache;
}

function flushCacheNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!cache || !cacheDirty) return;
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const tmpPath = `${CACHE_FILE}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(cache, null, 2), "utf8");
    fs.renameSync(tmpPath, CACHE_FILE);
    cacheDirty = false;
  } catch (error) {
    log.warn("Failed to save fingerprint cache", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function scheduleCacheSave(): void {
  cacheDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushCacheNow();
  }, CACHE_FLUSH_DEBOUNCE_MS);
  saveTimer.unref?.();
}

export type FingerprintResult = {
  fingerprint: string;
  duration: number;
};

function runFpcalc(filePath: string, fpcalcPath: string): Promise<FingerprintResult | null> {
  return new Promise((resolve) => {
    const child = spawn(fpcalcPath, ["-json", filePath], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let done = false;

    const timer = setTimeout(() => {
      done = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // Process may already have exited; nothing to clean up.
      }
      log.warn("fpcalc timed out", { filePath });
      resolve(null);
    }, FPCALC_TIMEOUT_MS);
    timer.unref?.();

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 4096) stderr = stderr.slice(-4096);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        // fpcalc not installed — record availability for next call
        fpcalcAvailable = false;
        log.info("fpcalc binary not available; AcoustID fingerprinting disabled", {
          path: fpcalcPath
        });
      } else {
        log.warn("fpcalc failed to start", { error: err.message });
      }
      resolve(null);
    });

    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (code !== 0) {
        log.warn(`fpcalc exited with code ${code}`, { stderr: stderr.trim() });
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { duration?: number; fingerprint?: string };
        if (typeof parsed.fingerprint === "string" && typeof parsed.duration === "number") {
          fpcalcAvailable = true;
          resolve({ fingerprint: parsed.fingerprint, duration: parsed.duration });
        } else {
          log.warn("fpcalc output missing fingerprint or duration");
          resolve(null);
        }
      } catch (error) {
        log.warn("Failed to parse fpcalc output", {
          error: error instanceof Error ? error.message : String(error)
        });
        resolve(null);
      }
    });
  });
}

export function isFingerprintingDisabled(): boolean {
  return fpcalcAvailable === false;
}

/**
 * Compute or return a cached Chromaprint fingerprint for a track. The cache
 * is keyed by trackId and invalidated when the file's mtime or size change.
 * Returns null if fpcalc is unavailable or the file can't be analyzed.
 */
export async function computeTrackFingerprint(
  trackId: string,
  absolutePath: string
): Promise<FingerprintResult | null> {
  if (fpcalcAvailable === false) return null;

  let stat: Awaited<ReturnType<typeof fsp.stat>>;
  try {
    stat = await fsp.stat(absolutePath);
  } catch {
    return null;
  }

  const c = loadCache();
  const cached = c[trackId];
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return { fingerprint: cached.fingerprint, duration: cached.duration };
  }

  const result = await runFpcalc(absolutePath, getFpcalcPath());
  if (!result) return null;

  c[trackId] = {
    fingerprint: result.fingerprint,
    duration: result.duration,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    computedAt: Date.now()
  };
  scheduleCacheSave();
  return result;
}

export function flushFingerprintCache(): void {
  flushCacheNow();
}

export function clearFingerprintCache(): void {
  cache = {};
  cacheDirty = true;
  flushCacheNow();
}

export function getFingerprintCacheStats(): { entries: number } {
  return { entries: Object.keys(loadCache()).length };
}

export function _resetFingerprintAvailabilityForTesting(): void {
  fpcalcAvailable = null;
}
