import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tmpDir: string;

vi.mock("../../utils/paths", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../utils/paths")>();
  return {
    ...original,
    get dataRoot() {
      return path.join(tmpDir, "data");
    }
  };
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "library-settings-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("librarySettings", () => {
  it("returns aiRecommendation=true by default when no file exists", async () => {
    const { getLibrarySettings } = await import("./librarySettings");
    const settings = await getLibrarySettings();
    expect(settings.aiRecommendation).toBe(true);
  });

  it("persists an update and reads it back", async () => {
    const { getLibrarySettings, updateLibrarySettings } = await import("./librarySettings");
    const updated = await updateLibrarySettings({ aiRecommendation: false });
    expect(updated.aiRecommendation).toBe(false);

    const reloaded = await getLibrarySettings();
    expect(reloaded.aiRecommendation).toBe(false);
  });

  it("ignores non-boolean values in a patch", async () => {
    const { getLibrarySettings, updateLibrarySettings } = await import("./librarySettings");
    await updateLibrarySettings({ aiRecommendation: false });

    // Pretend a misbehaving client sent a string. Should keep current value.
    const after = await updateLibrarySettings({ aiRecommendation: "off" as unknown as boolean });
    expect(after.aiRecommendation).toBe(false);

    const reloaded = await getLibrarySettings();
    expect(reloaded.aiRecommendation).toBe(false);
  });

  it("falls back to default when the on-disk value is malformed", async () => {
    const { getLibrarySettings } = await import("./librarySettings");
    const configDir = path.join(tmpDir, "data", "config");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "library-settings.json"),
      JSON.stringify({ aiRecommendation: "garbage" })
    );

    const settings = await getLibrarySettings();
    expect(settings.aiRecommendation).toBe(true);
  });
});
