import fs from "node:fs/promises";
import path from "node:path";

import { readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { scannerStateFilePath } from "../../utils/paths";

export type FileSystemTrackState = {
  ownerId: string;
  filePath: string;
  relativePath: string;
  trackId: string;
  size: number;
  mtimeMs: number;
  identity: string;
};

export type ScannerTrackState = {
  trackId: string;
  path: string;
  size: number;
  mtimeMs: number;
  identity: string;
};

export type ScannerStateSnapshot = {
  version: 1;
  tracks: ScannerTrackState[];
};

const SCANNER_STATE_VERSION = 1;

export function createTrackIdentity(relativePath: string, mtimeMs: number, size: number): string {
  return `${relativePath}:${mtimeMs}:${size}`;
}

function normalizeScannerState(raw: unknown): ScannerStateSnapshot {
  if (!raw || typeof raw !== "object") {
    return { version: SCANNER_STATE_VERSION, tracks: [] };
  }

  const source = raw as {
    version?: unknown;
    tracks?: unknown;
  };

  if (source.version !== SCANNER_STATE_VERSION || !Array.isArray(source.tracks)) {
    return { version: SCANNER_STATE_VERSION, tracks: [] };
  }

  const tracks: ScannerTrackState[] = [];
  for (const item of source.tracks) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const candidate = item as Partial<ScannerTrackState>;
    if (
      typeof candidate.trackId !== "string" ||
      typeof candidate.path !== "string" ||
      typeof candidate.identity !== "string" ||
      typeof candidate.size !== "number" ||
      typeof candidate.mtimeMs !== "number"
    ) {
      continue;
    }

    tracks.push({
      trackId: candidate.trackId,
      path: candidate.path,
      identity: candidate.identity,
      size: candidate.size,
      mtimeMs: candidate.mtimeMs
    });
  }

  return {
    version: SCANNER_STATE_VERSION,
    tracks
  };
}

export async function readScannerState(): Promise<ScannerStateSnapshot> {
  const raw = await readJsonFile<unknown>(scannerStateFilePath, {
    version: SCANNER_STATE_VERSION,
    tracks: []
  });

  return normalizeScannerState(raw);
}

export async function writeScannerState(states: FileSystemTrackState[]): Promise<void> {
  const snapshot: ScannerStateSnapshot = {
    version: SCANNER_STATE_VERSION,
    tracks: states.map((state) => ({
      trackId: state.trackId,
      path: state.relativePath,
      size: state.size,
      mtimeMs: state.mtimeMs,
      identity: state.identity
    }))
  };

  await fs.mkdir(path.dirname(scannerStateFilePath), { recursive: true });
  await writeJsonAtomic(scannerStateFilePath, snapshot);
}

export function createEmptyScannerState(): ScannerStateSnapshot {
  return { version: SCANNER_STATE_VERSION, tracks: [] };
}
