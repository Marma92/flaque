import type { LibraryIndex } from "../../types/library";
import { readJsonFile } from "../../utils/fs";
import { indexFilePath } from "../../utils/paths";
import { readTrackMetadataOverrides } from "../indexer/metadataOverrideStore";
import { readTrackOwnership, writeTrackOwnership } from "../storage/ownershipStore";
import { scanFilesystemPlaylists } from "../playlists/playlistStore";
import { type AlbumAggregate, flushAlbumMetadata } from "./scannerMedia";
import { createEmptyScannerState, readScannerState, writeScannerState } from "./scannerState";
import { collectFilesystemState } from "./filesystemCollector";
import { classifyTrackChanges } from "./changeDetector";
import { probeChangedTracks, mergeFinalTracks } from "./trackBuilder";

type ScanMode = "incremental" | "full";

type ScanFilesystemLibraryOptions = {
  mode?: ScanMode;
  previousIndex?: LibraryIndex;
};

async function performScan(
  mode: ScanMode,
  previousIndex: LibraryIndex | undefined,
  metadataOverrides: Record<string, { title?: string; artist?: string; album?: string; year?: number; genre?: string[] }>
): Promise<LibraryIndex> {
  const ownership = await readTrackOwnership();
  const filesystemState = await collectFilesystemState(ownership, metadataOverrides);
  const previousTracks = previousIndex?.tracks ?? [];
  const previousScannerState = mode === "incremental" ? await readScannerState() : createEmptyScannerState();
  const classified = classifyTrackChanges(filesystemState, previousTracks, previousScannerState);
  const albumsByDirectory = new Map<string, AlbumAggregate>();
  const processedArtists = new Set<string>();
  const processedAlbums = new Set<string>();

  const changedTracks = await probeChangedTracks(
    classified.changed, metadataOverrides, albumsByDirectory, processedArtists, processedAlbums
  );
  const tracks = await mergeFinalTracks(
    classified.unchanged, changedTracks, metadataOverrides, albumsByDirectory, processedArtists, processedAlbums
  );

  await flushAlbumMetadata(albumsByDirectory);
  await writeScannerState(filesystemState);

  const validPaths = new Set(filesystemState.map((state) => state.relativePath));
  const prunedOwnership: Record<string, string> = {};
  for (const [trackPath, owner] of Object.entries(ownership)) {
    if (validPaths.has(trackPath)) {
      prunedOwnership[trackPath] = owner;
    }
  }
  await writeTrackOwnership(prunedOwnership);

  const playlists = await scanFilesystemPlaylists(tracks);

  return {
    generatedAt: new Date().toISOString(),
    totalTracks: tracks.length,
    tracks,
    playlists
  };
}

export async function scanFilesystemLibrary(options: ScanFilesystemLibraryOptions = {}): Promise<LibraryIndex> {
  const metadataOverrides = await readTrackMetadataOverrides();
  const modeFromEnvironment = process.env.SCANNER_REBUILD_MODE === "full" ? "full" : "incremental";
  const requestedMode = options.mode ?? modeFromEnvironment;
  const previousIndex =
    options.previousIndex ??
    (await readJsonFile<LibraryIndex>(indexFilePath, {
      generatedAt: "",
      totalTracks: 0,
      tracks: [],
      playlists: []
    }));

  if (requestedMode === "full") {
    return performScan("full", previousIndex, metadataOverrides);
  }

  try {
    return await performScan("incremental", previousIndex, metadataOverrides);
  } catch {
    return performScan("full", previousIndex, metadataOverrides);
  }
}
