import { describe, expect, it } from "vitest";

import { sanitizeExtension } from "./uploadService";

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
});
