import { describe, expect, it } from "vitest";

import { parseTranscodeFormat } from "./transcodeService";

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
