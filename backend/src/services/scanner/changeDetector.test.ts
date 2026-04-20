import { describe, expect, it } from "vitest";

import type { Track } from "../../types/library";
import { classifyTrackChanges } from "./changeDetector";
import type { FileSystemTrackState, ScannerStateSnapshot } from "./scannerState";

function makeFsState(overrides: Partial<FileSystemTrackState> & { trackId: string }): FileSystemTrackState {
  return {
    ownerId: "owner",
    filePath: `/music/${overrides.trackId}.mp3`,
    relativePath: `${overrides.trackId}.mp3`,
    size: 1000,
    mtimeMs: 1,
    identity: "default-identity",
    ...overrides
  };
}

function makeTrack(id: string): Track {
  return {
    id,
    owner: "owner",
    path: `${id}.mp3`,
    duration: 10,
    mimeType: "audio/mpeg",
    codec: "mp3",
    tags: { title: id }
  };
}

function makeSnapshot(
  entries: Array<{ trackId: string; identity: string }>
): ScannerStateSnapshot {
  return {
    version: 1,
    tracks: entries.map(({ trackId, identity }) => ({
      trackId,
      path: `${trackId}.mp3`,
      size: 1000,
      mtimeMs: 1,
      identity
    }))
  };
}

describe("classifyTrackChanges", () => {
  it("returns empty partitions when inputs are empty", () => {
    const result = classifyTrackChanges([], [], { version: 1, tracks: [] });

    expect(result).toEqual({ changed: [], unchanged: [], deletedTrackIds: [] });
  });

  it("marks a track as unchanged when identity matches prior state", () => {
    const state = makeFsState({ trackId: "a", identity: "v1" });
    const previousTrack = makeTrack("a");
    const snapshot = makeSnapshot([{ trackId: "a", identity: "v1" }]);

    const result = classifyTrackChanges([state], [previousTrack], snapshot);

    expect(result.changed).toEqual([]);
    expect(result.deletedTrackIds).toEqual([]);
    expect(result.unchanged).toEqual([{ state, track: previousTrack }]);
  });

  it("marks a track as changed when identity differs", () => {
    const state = makeFsState({ trackId: "a", identity: "v2" });
    const previousTrack = makeTrack("a");
    const snapshot = makeSnapshot([{ trackId: "a", identity: "v1" }]);

    const result = classifyTrackChanges([state], [previousTrack], snapshot);

    expect(result.changed).toEqual([state]);
    expect(result.unchanged).toEqual([]);
    expect(result.deletedTrackIds).toEqual([]);
  });

  it("treats a track with no prior state as changed (new file)", () => {
    const state = makeFsState({ trackId: "new", identity: "v1" });

    const result = classifyTrackChanges([state], [], { version: 1, tracks: [] });

    expect(result.changed).toEqual([state]);
    expect(result.unchanged).toEqual([]);
    expect(result.deletedTrackIds).toEqual([]);
  });

  it("treats a track with prior state but missing track record as changed", () => {
    const state = makeFsState({ trackId: "a", identity: "v1" });
    const snapshot = makeSnapshot([{ trackId: "a", identity: "v1" }]);

    const result = classifyTrackChanges([state], [], snapshot);

    expect(result.changed).toEqual([state]);
    expect(result.unchanged).toEqual([]);
  });

  it("reports previous tracks absent from the filesystem as deleted", () => {
    const previousTracks = [makeTrack("a"), makeTrack("b"), makeTrack("c")];
    const snapshot = makeSnapshot([
      { trackId: "a", identity: "v1" },
      { trackId: "b", identity: "v1" },
      { trackId: "c", identity: "v1" }
    ]);
    const currentState = [makeFsState({ trackId: "a", identity: "v1" })];

    const result = classifyTrackChanges(currentState, previousTracks, snapshot);

    expect(result.unchanged.map((u) => u.track.id)).toEqual(["a"]);
    expect(result.changed).toEqual([]);
    expect(result.deletedTrackIds.sort()).toEqual(["b", "c"]);
  });

  it("partitions a mixed batch into changed, unchanged, and deleted", () => {
    const unchangedState = makeFsState({ trackId: "keep", identity: "v1" });
    const modifiedState = makeFsState({ trackId: "edit", identity: "v2" });
    const newState = makeFsState({ trackId: "new", identity: "v1" });

    const previousTracks = [makeTrack("keep"), makeTrack("edit"), makeTrack("gone")];
    const snapshot = makeSnapshot([
      { trackId: "keep", identity: "v1" },
      { trackId: "edit", identity: "v1" },
      { trackId: "gone", identity: "v1" }
    ]);

    const result = classifyTrackChanges(
      [unchangedState, modifiedState, newState],
      previousTracks,
      snapshot
    );

    expect(result.unchanged.map((u) => u.state.trackId)).toEqual(["keep"]);
    expect(result.changed.map((s) => s.trackId)).toEqual(["edit", "new"]);
    expect(result.deletedTrackIds).toEqual(["gone"]);
  });
});
