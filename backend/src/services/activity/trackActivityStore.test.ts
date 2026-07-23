import fsSync from "node:fs";
import fs from "node:fs/promises";import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { tmpDir } = vi.hoisted(() => {
  const fsS = require("node:fs") as typeof import("node:fs");
  const osM = require("node:os") as typeof import("node:os");
  const pathM = require("node:path") as typeof import("node:path");
  return {
    tmpDir: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "track-activity-test-"))
  };
});

vi.mock("../../utils/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths")>()),
  trackActivityLogFilePath: path.join(tmpDir, "track-activity-log.json")
}));

import type { Track } from "../../types/library";
import {
  appendTrackActivityLogEntries,
  readTrackActivityLog
} from "./trackActivityStore";

function makeTrack(id: string): Track {
  return {
    id,
    owner: "user-1",
    path: `/music/${id}.flac`,
    duration: 200,
    mimeType: "audio/flac",
    codec: "flac",
    tags: { title: id }
  };
}

beforeEach(async () => {
  for (const entry of await fs.readdir(tmpDir)) {
    await fs.rm(path.join(tmpDir, entry), { recursive: true, force: true });
  }
});

afterAll(() => {
  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

describe("trackActivityStore", () => {
  it("returns an empty log when the file does not exist", async () => {
    expect(await readTrackActivityLog()).toEqual([]);
  });

  it("is a no-op when appending zero entries", async () => {
    await appendTrackActivityLogEntries([]);
    expect(fsSync.existsSync(path.join(tmpDir, "track-activity-log.json"))).toBe(false);
  });

  it("appends new entries to the log in order", async () => {
    await appendTrackActivityLogEntries([makeTrack("a"), makeTrack("b")]);
    await appendTrackActivityLogEntries([makeTrack("c")]);
    const log = await readTrackActivityLog();
    expect(log.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("caps the log at 10 most recent entries", async () => {
    const batch = Array.from({ length: 15 }, (_, i) => makeTrack(`t${i}`));
    await appendTrackActivityLogEntries(batch);
    const log = await readTrackActivityLog();
    expect(log).toHaveLength(10);
    expect(log.map((t) => t.id)).toEqual([
      "t5", "t6", "t7", "t8", "t9", "t10", "t11", "t12", "t13", "t14"
    ]);
  });

  it("drops the oldest entries across multiple appends once past the cap", async () => {
    await appendTrackActivityLogEntries(
      Array.from({ length: 8 }, (_, i) => makeTrack(`old-${i}`))
    );
    await appendTrackActivityLogEntries([
      makeTrack("new-0"),
      makeTrack("new-1"),
      makeTrack("new-2"),
      makeTrack("new-3")
    ]);
    const log = await readTrackActivityLog();
    expect(log).toHaveLength(10);
    expect(log[0]?.id).toBe("old-2");
    expect(log[9]?.id).toBe("new-3");
  });
});
