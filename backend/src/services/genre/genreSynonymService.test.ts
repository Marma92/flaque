import fsSync from "node:fs";
import fs from "node:fs/promises";import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { tmpDir } = vi.hoisted(() => {
  const fsS = require("node:fs") as typeof import("node:fs");
  const osM = require("node:os") as typeof import("node:os");
  const pathM = require("node:path") as typeof import("node:path");
  return {
    tmpDir: fsS.mkdtempSync(pathM.join(osM.tmpdir(), "genre-synonyms-test-"))
  };
});

vi.mock("../../utils/paths", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/paths")>()),
  configRoot: tmpDir
}));

vi.mock("../../utils/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

import {
  getLibraryGenreLabels,
  getSynonyms,
  normalizeGenreLabel,
  normalizeGenreLabels,
  removeSynonym,
  resetSynonymsToDefaults,
  setSynonym
} from "./genreSynonymService";

beforeEach(async () => {
  for (const entry of await fs.readdir(tmpDir).catch(() => [])) {
    await fs.rm(path.join(tmpDir, entry), { recursive: true, force: true });
  }
  resetSynonymsToDefaults();
});

afterAll(() => {
  fsSync.rmSync(tmpDir, { recursive: true, force: true });
});

describe("genreSynonymService", () => {
  it("maps a known lowercase alias to its canonical label", () => {
    expect(normalizeGenreLabel("prog rock")).toBe("Progressive Rock");
    expect(normalizeGenreLabel("hip hop")).toBe("Hip-Hop");
  });

  it("is case- and whitespace-insensitive when matching aliases", () => {
    expect(normalizeGenreLabel("  Prog Rock  ")).toBe("Progressive Rock");
    expect(normalizeGenreLabel("HIPHOP")).toBe("Hip-Hop");
  });

  it("returns the trimmed input for unknown genres", () => {
    expect(normalizeGenreLabel("  Klezmer  ")).toBe("Klezmer");
  });

  it("deduplicates normalized labels case-insensitively", () => {
    const result = normalizeGenreLabels(["rap", "Hip-Hop", "hip hop", "Rock"]);
    expect(result).toEqual(["Hip-Hop", "Rock"]);
  });

  it("persists a new synonym across calls", () => {
    setSynonym("vapor", "Vaporwave");
    expect(normalizeGenreLabel("vapor")).toBe("Vaporwave");
    expect(getSynonyms()["vapor"]).toBe("Vaporwave");
  });

  it("removes a synonym and reports whether anything was removed", () => {
    setSynonym("vapor", "Vaporwave");
    expect(removeSynonym("vapor")).toBe(true);
    expect(removeSynonym("vapor")).toBe(false);
    expect(normalizeGenreLabel("vapor")).toBe("vapor");
  });

  it("resets synonyms back to defaults", () => {
    setSynonym("custom-key", "Custom");
    resetSynonymsToDefaults();
    expect(getSynonyms()["custom-key"]).toBeUndefined();
    expect(normalizeGenreLabel("rap")).toBe("Hip-Hop");
  });

  describe("getLibraryGenreLabels", () => {
    it("counts unique labels case-insensitively and reports synonyms", () => {
      const tracks = [
        { genre: ["Rock", "Hip Hop"] },
        { genre: ["rock", "Indie Rock"] },
        { genre: ["Hip Hop"] },
        { genre: [] },
        {}
      ];
      const labels = getLibraryGenreLabels(tracks);
      expect(labels.find((l) => l.label.toLowerCase() === "rock")?.count).toBe(2);
      expect(labels.find((l) => l.label.toLowerCase() === "hip hop")?.count).toBe(2);
      expect(labels.find((l) => l.label.toLowerCase() === "indie rock")?.count).toBe(1);
      // hip hop maps to Hip-Hop via default synonyms
      expect(labels.find((l) => l.label.toLowerCase() === "hip hop")?.canonical).toBe("Hip-Hop");
      // Indie Rock is already canonical → no canonical field
      expect(labels.find((l) => l.label.toLowerCase() === "indie rock")?.canonical).toBeUndefined();
    });

    it("sorts by count descending, then label ascending", () => {
      const tracks = [
        { genre: ["B"] },
        { genre: ["A"] },
        { genre: ["A"] },
        { genre: ["C"] }
      ];
      const labels = getLibraryGenreLabels(tracks);
      expect(labels.map((l) => l.label)).toEqual(["A", "B", "C"]);
    });
  });
});
