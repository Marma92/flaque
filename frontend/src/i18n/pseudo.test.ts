import { describe, expect, it } from "vitest";

import { pseudoizeResource, pseudoizeString } from "./pseudo";

describe("pseudoizeString", () => {
  it("wraps and accents plain text", () => {
    const out = pseudoizeString("Save");
    expect(out.startsWith("⟦")).toBe(true);
    expect(out.endsWith("⟧")).toBe(true);
    expect(out).not.toContain("Save");
    // ASCII letters are replaced with accented look-alikes.
    expect(out).toMatch(/[áéíóúŠ]/);
  });

  it("preserves interpolation placeholders verbatim", () => {
    expect(pseudoizeString("Play {{name}}")).toContain("{{name}}");
  });

  it("preserves markup tags verbatim", () => {
    const out = pseudoizeString("Delete <strong>{{count}} files</strong>");
    expect(out).toContain("<strong>");
    expect(out).toContain("</strong>");
    expect(out).toContain("{{count}}");
  });

  it("pads to surface truncation", () => {
    expect(pseudoizeString("A longer sentence here")).toContain("·");
  });
});

describe("pseudoizeResource", () => {
  it("recurses through nested objects, transforming leaf strings only", () => {
    const out = pseudoizeResource({ a: "Hello", nested: { b: "World" }, n: 5 }) as {
      a: string;
      nested: { b: string };
      n: number;
    };
    expect(out.a).not.toBe("Hello");
    expect(out.nested.b).not.toBe("World");
    expect(out.n).toBe(5);
  });
});
