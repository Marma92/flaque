import { describe, expect, it } from "vitest";

import { sanitizeExtension } from "./uploadService";
import { collectUploadedFiles, parseUploadMetadataOverrides } from "../../api/uploadRoutes";

describe("sanitizeExtension", () => {
  it("returns the extension for supported audio formats", () => {
    expect(sanitizeExtension("track.flac")).toBe(".flac");
    expect(sanitizeExtension("track.mp3")).toBe(".mp3");
    expect(sanitizeExtension("track.ogg")).toBe(".ogg");
    expect(sanitizeExtension("track.wav")).toBe(".wav");
    expect(sanitizeExtension("track.m4a")).toBe(".m4a");
  });

  it("lowercases the extension", () => {
    expect(sanitizeExtension("track.FLAC")).toBe(".flac");
    expect(sanitizeExtension("track.Mp3")).toBe(".mp3");
  });

  it("falls back to .flac for unsupported or missing extensions", () => {
    expect(sanitizeExtension("track.txt")).toBe(".flac");
    expect(sanitizeExtension("track")).toBe(".flac");
    expect(sanitizeExtension("")).toBe(".flac");
  });

  it("handles dotfiles and double extensions", () => {
    expect(sanitizeExtension(".flac")).toBe(".flac");
    expect(sanitizeExtension("track.backup.mp3")).toBe(".mp3");
    expect(sanitizeExtension("track.tar.gz")).toBe(".flac");
  });
});

// ── parseUploadMetadataOverrides ──────────────────────────────────────

describe("parseUploadMetadataOverrides", () => {
  it("parses a valid JSON array of overrides", () => {
    const input = JSON.stringify([
      { title: "Track 1", artist: "Artist A", album: "Album X" },
      { title: "Track 2" }
    ]);

    const result = parseUploadMetadataOverrides(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ title: "Track 1", artist: "Artist A", album: "Album X" });
    expect(result[1]).toMatchObject({ title: "Track 2" });
  });

  it("returns empty array for non-string input", () => {
    expect(parseUploadMetadataOverrides(undefined)).toEqual([]);
    expect(parseUploadMetadataOverrides(null)).toEqual([]);
    expect(parseUploadMetadataOverrides(123)).toEqual([]);
    expect(parseUploadMetadataOverrides(true)).toEqual([]);
    expect(parseUploadMetadataOverrides({})).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseUploadMetadataOverrides("not json")).toEqual([]);
    expect(parseUploadMetadataOverrides("{invalid")).toEqual([]);
  });

  it("returns empty array when JSON is not an array", () => {
    expect(parseUploadMetadataOverrides(JSON.stringify({ title: "X" }))).toEqual([]);
    expect(parseUploadMetadataOverrides(JSON.stringify("string"))).toEqual([]);
  });

  it("returns empty objects for null or non-object entries", () => {
    const input = JSON.stringify([null, "string", 42, { title: "Valid" }]);
    const result = parseUploadMetadataOverrides(input);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({});
    expect(result[1]).toEqual({});
    expect(result[2]).toEqual({});
    expect(result[3]).toMatchObject({ title: "Valid" });
  });

  it("trims whitespace and drops empty strings in overrides", () => {
    const input = JSON.stringify([{ title: "  Hello  ", artist: "  ", album: "" }]);
    const result = parseUploadMetadataOverrides(input);
    expect(result[0]!.title).toBe("Hello");
    // normalizeOptionalString returns undefined for whitespace-only or empty
    expect(result[0]!.artist).toBeUndefined();
    expect(result[0]!.album).toBeUndefined();
  });
});

// ── collectUploadedFiles ──────────────────────────────────────────────

describe("collectUploadedFiles", () => {
  const fakeFile = (name: string) => ({ originalname: name } as Express.Multer.File);

  it("returns empty array for falsy input", () => {
    expect(collectUploadedFiles(null)).toEqual([]);
    expect(collectUploadedFiles(undefined)).toEqual([]);
    expect(collectUploadedFiles(false)).toEqual([]);
  });

  it("returns the array directly when given an array", () => {
    const files = [fakeFile("a.flac"), fakeFile("b.mp3")];
    expect(collectUploadedFiles(files)).toEqual(files);
  });

  it("collects files from 'files' and 'file' field names", () => {
    const filesField = [fakeFile("a.flac"), fakeFile("b.flac")];
    const fileField = [fakeFile("c.mp3")];
    const result = collectUploadedFiles({ files: filesField, file: fileField });
    expect(result).toHaveLength(3);
    expect(result.map((f) => f.originalname)).toEqual(["a.flac", "b.flac", "c.mp3"]);
  });

  it("handles missing field names gracefully", () => {
    expect(collectUploadedFiles({ files: undefined, file: undefined })).toEqual([]);
    expect(collectUploadedFiles({})).toEqual([]);
  });

  it("handles only 'file' field present", () => {
    const fileField = [fakeFile("single.flac")];
    const result = collectUploadedFiles({ file: fileField });
    expect(result).toHaveLength(1);
    expect(result[0]!.originalname).toBe("single.flac");
  });
});
