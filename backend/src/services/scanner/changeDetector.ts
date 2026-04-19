import type { Track } from "../../types/library";
import type { FileSystemTrackState, ScannerStateSnapshot } from "./scannerState";

export type ClassifiedTracks = {
  changed: FileSystemTrackState[];
  unchanged: Array<{
    state: FileSystemTrackState;
    track: Track;
  }>;
  deletedTrackIds: string[];
};

export function classifyTrackChanges(
  filesystemState: FileSystemTrackState[],
  previousTracks: Track[],
  previousScannerState: ScannerStateSnapshot
): ClassifiedTracks {
  const currentTrackIds = new Set<string>();
  const previousTracksById = new Map(previousTracks.map((track) => [track.id, track]));
  const previousStateByTrackId = new Map(previousScannerState.tracks.map((state) => [state.trackId, state]));

  const changed: FileSystemTrackState[] = [];
  const unchanged: ClassifiedTracks["unchanged"] = [];

  for (const state of filesystemState) {
    currentTrackIds.add(state.trackId);
    const previousState = previousStateByTrackId.get(state.trackId);
    const previousTrack = previousTracksById.get(state.trackId);

    if (previousState && previousTrack && previousState.identity === state.identity) {
      unchanged.push({ state, track: previousTrack });
      continue;
    }

    changed.push(state);
  }

  const deletedTrackIds: string[] = [];
  for (const previousTrack of previousTracks) {
    if (!currentTrackIds.has(previousTrack.id)) {
      deletedTrackIds.push(previousTrack.id);
    }
  }

  return { changed, unchanged, deletedTrackIds };
}
