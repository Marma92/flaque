import { describe, expect, it } from "vitest";

import {
  hasOwnProperty,
  normalizeQueryValue,
  parseMetadataField,
  readDirection,
  readFilter,
  readTracksQuery,
  readWrap
} from "./queryParsers";

describe("normalizeQueryValue", () => {
  it("returns trimmed string for non-empty values", () => {
    expect(normalizeQueryValue("  hello  ")).toBe("hello");
  });

  it("returns undefined for empty or non-string values", () => {
    expect(normalizeQueryValue("")).toBeUndefined();
    expect(normalizeQueryValue("   ")).toBeUndefined();
    expect(normalizeQueryValue(undefined)).toBeUndefined();
    expect(normalizeQueryValue(42)).toBeUndefined();
  });

  it("uses the first element of an array", () => {
    expect(normalizeQueryValue(["first", "second"])).toBe("first");
    expect(normalizeQueryValue([42])).toBeUndefined();
    expect(normalizeQueryValue([])).toBeUndefined();
  });
});

describe("readFilter", () => {
  it("extracts filter fields from query", () => {
    expect(readFilter({ owner: "alice", artist: "Artist", album: "Album", q: "search" })).toEqual({
      owner: "alice",
      artist: "Artist",
      album: "Album",
      q: "search"
    });
  });

  it("returns undefined for missing fields", () => {
    expect(readFilter({})).toEqual({
      owner: undefined,
      artist: undefined,
      album: undefined,
      q: undefined
    });
  });
});

describe("readTracksQuery", () => {
  it("returns defaults for empty query", () => {
    const result = readTracksQuery({});
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
      expect(result.sortDir).toBe("asc");
    }
  });

  it("parses page and limit", () => {
    const result = readTracksQuery({ page: "2", limit: "50" });
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    }
  });

  it("returns error for invalid page", () => {
    const result = readTracksQuery({ page: "0" });
    expect(result).toHaveProperty("error");
  });

  it("returns error for invalid sortBy", () => {
    const result = readTracksQuery({ sortBy: "invalid" });
    expect(result).toHaveProperty("error");
  });

  it("returns error for invalid sortDir", () => {
    const result = readTracksQuery({ sortDir: "sideways" });
    expect(result).toHaveProperty("error");
  });

  it("returns error for invalid addedAfter", () => {
    const result = readTracksQuery({ addedAfter: "not-a-date" });
    expect(result).toHaveProperty("error");
  });

  it("accepts valid addedAfter", () => {
    const result = readTracksQuery({ addedAfter: "2024-01-01T00:00:00Z" });
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.addedAfter).toBe("2024-01-01T00:00:00.000Z");
    }
  });
});

describe("readDirection", () => {
  it("returns next by default", () => {
    expect(readDirection(undefined)).toBe("next");
  });

  it("parses valid directions", () => {
    expect(readDirection("next")).toBe("next");
    expect(readDirection("previous")).toBe("previous");
  });

  it("returns null for invalid directions", () => {
    expect(readDirection("sideways")).toBeNull();
  });
});

describe("readWrap", () => {
  it("returns true by default", () => {
    expect(readWrap(undefined)).toBe(true);
  });

  it("returns false for falsy strings", () => {
    expect(readWrap("false")).toBe(false);
    expect(readWrap("0")).toBe(false);
    expect(readWrap("no")).toBe(false);
  });

  it("returns true for other strings", () => {
    expect(readWrap("true")).toBe(true);
    expect(readWrap("yes")).toBe(true);
  });
});

describe("hasOwnProperty", () => {
  it("returns true when property exists", () => {
    expect(hasOwnProperty({ key: "value" }, "key")).toBe(true);
    expect(hasOwnProperty({ key: undefined }, "key")).toBe(true);
  });

  it("returns false when property does not exist", () => {
    expect(hasOwnProperty({}, "key")).toBe(false);
    expect(hasOwnProperty(null, "key")).toBe(false);
    expect(hasOwnProperty(undefined, "key")).toBe(false);
  });
});

describe("parseMetadataField", () => {
  it("returns trimmed string for non-empty values", () => {
    expect(parseMetadataField("  hello  ")).toBe("hello");
  });

  it("returns undefined for null, undefined, or empty strings", () => {
    expect(parseMetadataField(null)).toBeUndefined();
    expect(parseMetadataField(undefined)).toBeUndefined();
    expect(parseMetadataField("  ")).toBeUndefined();
  });

  it("returns null for non-string values", () => {
    expect(parseMetadataField(42)).toBeNull();
    expect(parseMetadataField(true)).toBeNull();
  });
});
