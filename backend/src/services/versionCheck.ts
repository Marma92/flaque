import fs from "node:fs";
import path from "node:path";

import { createLogger } from "../utils/logger";

const log = createLogger("version-check");

const GITHUB_API_URL = "https://api.github.com/repos/Marma92/flaque/releases/latest";
const DEFAULT_INTERVAL_HOURS = 6;

export type VersionCheckResult = {
  currentVersion: string;
  latestVersion: string | null;
  isUpdateAvailable: boolean;
  releaseUrl: string | null;
  releaseName: string | null;
  publishedAt: string | null;
  checkedAt: string | null;
};

function readCurrentVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, "../../package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parseVersion(tag: string): number[] {
  const cleaned = tag.replace(/^v/, "");
  return cleaned.split(".").map((part) => {
    const n = Number(part);
    return Number.isFinite(n) ? n : 0;
  });
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  const length = Math.max(latestParts.length, currentParts.length);

  for (let i = 0; i < length; i++) {
    const l = latestParts[i] ?? 0;
    const c = currentParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }

  return false;
}

const currentVersion = readCurrentVersion();

let cachedResult: VersionCheckResult = {
  currentVersion,
  latestVersion: null,
  isUpdateAvailable: false,
  releaseUrl: null,
  releaseName: null,
  publishedAt: null,
  checkedAt: null
};

let hasLoggedError = false;

async function fetchLatestRelease(): Promise<void> {
  try {
    const response = await fetch(GITHUB_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `flaque/${currentVersion}`
      },
      signal: AbortSignal.timeout(15_000)
    });

    if (!response.ok) {
      if (!hasLoggedError) {
        log.warn(`GitHub API returned ${response.status} — update checks may not work`, {
          status: response.status
        });
        hasLoggedError = true;
      }
      return;
    }

    const data = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      name?: string;
      published_at?: string;
    };

    const latestTag = typeof data.tag_name === "string" ? data.tag_name : null;
    if (!latestTag) {
      return;
    }

    const latestVersion = latestTag.replace(/^v/, "");

    cachedResult = {
      currentVersion,
      latestVersion,
      isUpdateAvailable: isNewerVersion(latestVersion, currentVersion),
      releaseUrl: typeof data.html_url === "string" ? data.html_url : null,
      releaseName: typeof data.name === "string" ? data.name : null,
      publishedAt: typeof data.published_at === "string" ? data.published_at : null,
      checkedAt: new Date().toISOString()
    };

    hasLoggedError = false;

    if (cachedResult.isUpdateAvailable) {
      log.info(`Update available: v${latestVersion} (current: v${currentVersion})`);
    }
  } catch (error) {
    if (!hasLoggedError) {
      log.warn("Failed to check for updates", {
        error: error instanceof Error ? error.message : String(error)
      });
      hasLoggedError = true;
    }
  }
}

function isEnabled(): boolean {
  const raw = process.env.UPDATE_CHECK_ENABLED;
  if (raw === undefined || raw === "") return true;
  return raw !== "false" && raw !== "0";
}

export function startVersionCheckSchedule(): void {
  if (!isEnabled()) {
    log.info("Update checks disabled via UPDATE_CHECK_ENABLED");
    return;
  }

  const intervalHours = Math.max(
    1,
    Number(process.env.UPDATE_CHECK_INTERVAL_HOURS) || DEFAULT_INTERVAL_HOURS
  );
  const intervalMs = intervalHours * 60 * 60 * 1000;

  log.info(`Update checks enabled — polling every ${intervalHours}h`);

  void fetchLatestRelease();
  setInterval(() => {
    void fetchLatestRelease();
  }, intervalMs).unref();
}

export function getVersionCheckResult(): VersionCheckResult {
  return { ...cachedResult };
}
