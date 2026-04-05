import { describe, expect, it } from "vitest";

import { getTranscodeCapacity, parseTranscodeFormat } from "./transcodeService";

describe("parseTranscodeFormat", () => {
  it("parses supported values", () => {
    expect(parseTranscodeFormat("opus")).toBe("opus");
    expect(parseTranscodeFormat("mp3")).toBe("mp3");
    expect(parseTranscodeFormat(" OPUS ")).toBe("opus");
  });

  it("returns undefined when omitted", () => {
    expect(parseTranscodeFormat(undefined)).toBeUndefined();
    expect(parseTranscodeFormat("")).toBeUndefined();
    expect(parseTranscodeFormat([])).toBeUndefined();
  });

  it("returns null for unsupported values", () => {
    expect(parseTranscodeFormat("flac")).toBeNull();
    expect(parseTranscodeFormat("aac")).toBeNull();
    expect(parseTranscodeFormat(123)).toBeNull();
  });
});

describe("getTranscodeCapacity", () => {
  it("reports capacity status", () => {
    const capacity = getTranscodeCapacity();
    expect(capacity).toHaveProperty("active");
    expect(capacity).toHaveProperty("max");
    expect(capacity).toHaveProperty("available");
    expect(typeof capacity.active).toBe("number");
    expect(typeof capacity.max).toBe("number");
    expect(capacity.max).toBeGreaterThanOrEqual(1);
    expect(capacity.available).toBe(capacity.active < capacity.max);
  });
});
