/**
 * Admin-level toggles for library-wide behaviour. Persisted as JSON in the
 * config dir so they survive restarts and can be edited by hand in a pinch.
 */

import path from "node:path";

import { dataRoot } from "../../utils/paths";
import { ensureDir, readJsonFile, writeJsonAtomic } from "../../utils/fs";

function settingsFile(): string {
  return path.join(dataRoot, "config", "library-settings.json");
}

export type LibrarySettings = {
  /**
   * When true, new uploads embed via the CLAP sidecar (512-dim) and the
   * for-you ranker leans on embedding cosine as the primary fit signal.
   *
   * When false, embeddings fall back to the legacy 32-dim MFCC pipeline
   * (no Python, no sidecar) and the ranker reverts to its pre-CLAP
   * weights and pre-rank filters. Designed for light servers that don't
   * want to host the ~1 GB CLAP runtime.
   */
  aiRecommendation: boolean;
};

const DEFAULT_SETTINGS: LibrarySettings = {
  aiRecommendation: true
};

/**
 * Read the current library-wide settings. Missing or malformed fields
 * fall back to `DEFAULT_SETTINGS`, so callers always get a fully-populated
 * value and never have to special-case "settings file doesn't exist yet".
 */
export async function getLibrarySettings(): Promise<LibrarySettings> {
  const raw = await readJsonFile<Partial<LibrarySettings>>(settingsFile(), {});
  return {
    aiRecommendation: typeof raw.aiRecommendation === "boolean"
      ? raw.aiRecommendation
      : DEFAULT_SETTINGS.aiRecommendation
  };
}

/**
 * Merge `patch` into the current settings and persist atomically. Fields
 * whose patch value isn't a valid type are silently ignored — the API
 * route is the right layer for telling a misbehaving client off, this
 * helper is just defensive about what lands on disk.
 *
 * Returns the resulting full settings object.
 */
export async function updateLibrarySettings(
  patch: Partial<LibrarySettings>
): Promise<LibrarySettings> {
  const current = await getLibrarySettings();
  const next: LibrarySettings = {
    aiRecommendation: typeof patch.aiRecommendation === "boolean"
      ? patch.aiRecommendation
      : current.aiRecommendation
  };
  const file = settingsFile();
  await ensureDir(path.dirname(file));
  await writeJsonAtomic(file, next);
  return next;
}
