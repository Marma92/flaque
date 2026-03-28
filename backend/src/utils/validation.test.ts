import { describe, expect, it } from "vitest";

import {
  normalizeOptionalString,
  parseBooleanField,
  parseRole,
  validateEmail,
  validatePassword,
  validateUsername
} from "./validation";

describe("normalizeOptionalString", () => {
  it("returns trimmed string for non-empty values", () => {
    expect(normalizeOptionalString("  hello  ")).toBe("hello");
    expect(normalizeOptionalString("test")).toBe("test");
  });

  it("returns undefined for empty or whitespace-only strings", () => {
    expect(normalizeOptionalString("")).toBeUndefined();
    expect(normalizeOptionalString("   ")).toBeUndefined();
  });

  it("returns undefined for non-string values", () => {
    expect(normalizeOptionalString(undefined)).toBeUndefined();
    expect(normalizeOptionalString(null)).toBeUndefined();
    expect(normalizeOptionalString(42)).toBeUndefined();
    expect(normalizeOptionalString(true)).toBeUndefined();
  });
});

describe("parseBooleanField", () => {
  it("returns true for truthy string values", () => {
    expect(parseBooleanField("1")).toBe(true);
    expect(parseBooleanField("true")).toBe(true);
    expect(parseBooleanField("True")).toBe(true);
    expect(parseBooleanField("TRUE")).toBe(true);
    expect(parseBooleanField("yes")).toBe(true);
    expect(parseBooleanField("YES")).toBe(true);
  });

  it("returns false for other string values", () => {
    expect(parseBooleanField("0")).toBe(false);
    expect(parseBooleanField("false")).toBe(false);
    expect(parseBooleanField("no")).toBe(false);
    expect(parseBooleanField("")).toBe(false);
    expect(parseBooleanField("maybe")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(parseBooleanField(undefined)).toBe(false);
    expect(parseBooleanField(null)).toBe(false);
    expect(parseBooleanField(1)).toBe(false);
    expect(parseBooleanField(true)).toBe(false);
  });
});

describe("validatePassword", () => {
  it("returns null for valid passwords", () => {
    expect(validatePassword("abcdefgh")).toBeNull();
    expect(validatePassword("a".repeat(256))).toBeNull();
  });

  it("returns error for too short passwords", () => {
    expect(validatePassword("short")).toEqual(expect.stringContaining("between"));
    expect(validatePassword("")).toEqual(expect.stringContaining("between"));
  });

  it("returns error for too long passwords", () => {
    expect(validatePassword("a".repeat(257))).toEqual(expect.stringContaining("between"));
  });
});

describe("validateUsername", () => {
  it("returns null for valid usernames", () => {
    expect(validateUsername("alice")).toBeNull();
    expect(validateUsername("user.name")).toBeNull();
    expect(validateUsername("user_name")).toBeNull();
    expect(validateUsername("user-name")).toBeNull();
    expect(validateUsername("User123")).toBeNull();
  });

  it("returns error for too short usernames", () => {
    expect(validateUsername("ab")).toEqual(expect.stringContaining("3-32"));
  });

  it("returns error for too long usernames", () => {
    expect(validateUsername("a".repeat(33))).toEqual(expect.stringContaining("3-32"));
  });

  it("returns error for invalid characters", () => {
    expect(validateUsername("hello world")).toEqual(expect.stringContaining("letters"));
    expect(validateUsername("user@name")).toEqual(expect.stringContaining("letters"));
  });
});

describe("validateEmail", () => {
  it("returns null for valid emails", () => {
    expect(validateEmail("user@example.com")).toBeNull();
    expect(validateEmail("a@b")).toBeNull();
  });

  it("returns error for invalid emails", () => {
    expect(validateEmail("")).toEqual(expect.stringContaining("email"));
    expect(validateEmail("nope")).toEqual(expect.stringContaining("email"));
  });
});

describe("parseRole", () => {
  it("returns the role for valid values", () => {
    expect(parseRole("user")).toBe("user");
    expect(parseRole("admin")).toBe("admin");
  });

  it("returns null for invalid values", () => {
    expect(parseRole("superadmin")).toBeNull();
    expect(parseRole(123)).toBeNull();
  });

  it("returns default role for empty values", () => {
    expect(parseRole(undefined, "user")).toBe("user");
    expect(parseRole(null, "user")).toBe("user");
    expect(parseRole("", "admin")).toBe("admin");
  });

  it("returns null for empty values when no default is provided", () => {
    expect(parseRole(undefined)).toBeNull();
    expect(parseRole(null)).toBeNull();
    expect(parseRole("")).toBeNull();
  });
});
