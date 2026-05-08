import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { tmpDir } = vi.hoisted(() => {
  const fsS = require("node:fs") as typeof import("node:fs");
  const osM = require("node:os") as typeof import("node:os");
  const pathM = require("node:path") as typeof import("node:path");
  return {
    tmpDir: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "overrides-test-"))
  };
});

vi.mock("../../utils/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths")>()),
  metadataOverridesFilePath: path.join(tmpDir, "track-metadata-overrides.json")
}));

import {
  mergeTrackMetadataOverrides,
  pruneTrackMetadataOverrides,
  readTrackMetadataOverrides
} from "./metadataOverrideStore";

beforeEach(async () => {
  for (const entry of await fs.readdir(tmpDir)) {
    await fs.rm(path.join(tmpDir, entry), { recursive: true, force: true });
  }
});

afterAll(() => {
  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

describe("metadataOverrideStore", () => {
  it("returns an empty map when no file exists", async () => {
    expect(await readTrackMetadataOverrides()).toEqual({});
  });

  it("persists a well-formed merge patch", async () => {
    const result = await mergeTrackMetadataOverrides({
      "track-1": { title: "New", artist: "A", album: "B", year: 2024, genre: ["rock"] }
    });
    expect(result["track-1"]).toEqual({
      title: "New",
      artist: "A",
      album: "B",
      year: 2024,
      genre: ["rock"]
    });
    expect(await readTrackMetadataOverrides()).toEqual(result);
  });

  it("removes an override when the patch contains an empty entry", async () => {
    await mergeTrackMetadataOverrides({ "track-1": { title: "Old" } });
    await mergeTrackMetadataOverrides({ "track-1": {} });
    expect(await readTrackMetadataOverrides()).toEqual({});
  });

  it("rejects invalid years and out-of-bounds values", async () => {
    const result = await mergeTrackMetadataOverrides({
      "track-1": { title: "X", year: 999 as unknown as number }
    });
    expect(result["track-1"]?.year).toBeUndefined();
    expect(result["track-1"]?.title).toBe("X");
  });

  it("serializes concurrent merges without losing overrides", async () => {
    await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        mergeTrackMetadataOverrides({ [`track-${i}`]: { title: `t${i}` } })
      )
    );
    const final = await readTrackMetadataOverrides();
    expect(Object.keys(final)).toHaveLength(15);
    for (let i = 0; i < 15; i++) {
      expect(final[`track-${i}`]?.title).toBe(`t${i}`);
    }
  });

  it("prunes overrides whose track ids are no longer in the valid set", async () => {
    await mergeTrackMetadataOverrides({
      "keep": { title: "Kept" },
      "drop": { title: "Dropped" }
    });
    await pruneTrackMetadataOverrides(["keep"]);
    const after = await readTrackMetadataOverrides();
    expect(after).toEqual({
      keep: {
        title: "Kept",
        artist: undefined,
        album: undefined,
        year: undefined,
        genre: undefined,
        mbidRecording: undefined,
        mbidReleaseGroup: undefined,
        mbidArtist: undefined
      }
    });
  });

  it("persists MBID fields and validates UUID shape", async () => {
    const validMbid = "0123abcd-1234-5678-9abc-def012345678";
    const result = await mergeTrackMetadataOverrides({
      "track-1": {
        genre: ["Rock"],
        mbidRecording: validMbid,
        mbidReleaseGroup: validMbid,
        mbidArtist: validMbid
      }
    });
    expect(result["track-1"]?.mbidRecording).toBe(validMbid);
    expect(result["track-1"]?.mbidReleaseGroup).toBe(validMbid);
    expect(result["track-1"]?.mbidArtist).toBe(validMbid);

    // Round-trip through readTrackMetadataOverrides
    const readBack = await readTrackMetadataOverrides();
    expect(readBack["track-1"]?.mbidRecording).toBe(validMbid);
  });

  it("rejects invalid MBID values silently", async () => {
    const result = await mergeTrackMetadataOverrides({
      "track-1": {
        title: "X",
        mbidRecording: "not-a-uuid" as unknown as string,
        mbidArtist: "" as unknown as string
      }
    });
    expect(result["track-1"]?.title).toBe("X");
    expect(result["track-1"]?.mbidRecording).toBeUndefined();
    expect(result["track-1"]?.mbidArtist).toBeUndefined();
  });
});
