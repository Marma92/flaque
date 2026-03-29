import { describe, expect, it } from "vitest";

import {
  normalizeDirectorySegment,
  pickImageExtension,
  pickImageExtensionFromCoverFormat
} from "./mediaMetadataService";

describe("normalizeDirectorySegment", () => {
  it("lowercases and replaces non-alphanumeric chars with underscores", () => {
    expect(normalizeDirectorySegment("Sleep Token")).toBe("sleep_token");
    expect(normalizeDirectorySegment("Bring Me The Horizon")).toBe("bring_me_the_horizon");
  });

  it("removes accents", () => {
    expect(normalizeDirectorySegment("Béla Fleck")).toBe("bela_fleck");
    expect(normalizeDirectorySegment("Sigur Rós")).toBe("sigur_ros");
  });

  it("removes leading and trailing underscores", () => {
    expect(normalizeDirectorySegment("  hello  ")).toBe("hello");
    expect(normalizeDirectorySegment("--test--")).toBe("test");
  });

  it("collapses consecutive underscores", () => {
    expect(normalizeDirectorySegment("a   b")).toBe("a_b");
    expect(normalizeDirectorySegment("a---b")).toBe("a_b");
  });

  it("returns 'unknown' for empty or whitespace-only input", () => {
    expect(normalizeDirectorySegment("")).toBe("unknown");
    expect(normalizeDirectorySegment("   ")).toBe("unknown");
    expect(normalizeDirectorySegment("---")).toBe("unknown");
  });

  it("handles purely numeric names", () => {
    expect(normalizeDirectorySegment("1975")).toBe("1975");
  });
});

describe("pickImageExtension", () => {
  it("returns extension based on content type", () => {
    expect(pickImageExtension("image/png", "http://example.com/img")).toBe(".png");
    expect(pickImageExtension("image/webp", "http://example.com/img")).toBe(".webp");
    expect(pickImageExtension("image/jpeg", "http://example.com/img")).toBe(".jpg");
    expect(pickImageExtension("image/jpg", "http://example.com/img")).toBe(".jpg");
  });

  it("falls back to URL extension when content type is unknown", () => {
    expect(pickImageExtension("application/octet-stream", "http://example.com/photo.png")).toBe(".png");
    expect(pickImageExtension(null, "http://example.com/photo.webp")).toBe(".webp");
  });

  it("defaults to .jpg for unknown types and URLs", () => {
    expect(pickImageExtension(null, "http://example.com/photo")).toBe(".jpg");
    expect(pickImageExtension("text/html", "http://example.com/photo")).toBe(".jpg");
  });
});

describe("pickImageExtensionFromCoverFormat", () => {
  it("returns extension based on format string", () => {
    expect(pickImageExtensionFromCoverFormat("image/png")).toBe(".png");
    expect(pickImageExtensionFromCoverFormat("image/webp")).toBe(".webp");
    expect(pickImageExtensionFromCoverFormat("image/jpeg")).toBe(".jpg");
    expect(pickImageExtensionFromCoverFormat("jpg")).toBe(".jpg");
  });

  it("defaults to .jpg for unknown or missing format", () => {
    expect(pickImageExtensionFromCoverFormat(undefined)).toBe(".jpg");
    expect(pickImageExtensionFromCoverFormat("")).toBe(".jpg");
    expect(pickImageExtensionFromCoverFormat("something")).toBe(".jpg");
  });
});
