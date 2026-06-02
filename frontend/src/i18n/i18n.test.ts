/* @vitest-environment happy-dom */

import { afterEach, describe, expect, it } from "vitest";

import i18n from "./index";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("i18n", () => {
  it("serves English strings by default", () => {
    expect(i18n.t("player:controls.next")).toBe("Next");
    expect(i18n.t("common:unknownArtist")).toBe("Unknown artist");
  });

  it("serves French strings after switching language", async () => {
    await i18n.changeLanguage("fr");
    expect(i18n.t("player:controls.next")).toBe("Suivant");
    expect(i18n.t("common:unknownArtist")).toBe("Artiste inconnu");
  });

  it("interpolates values in the active language", async () => {
    await i18n.changeLanguage("fr");
    expect(i18n.t("player:transcode.fallbackActive", { codec: "OPUS" })).toBe(
      "Diffusion en repli via OPUS."
    );
  });

  it("falls back to English for an unsupported language", async () => {
    await i18n.changeLanguage("de");
    expect(i18n.t("player:controls.next")).toBe("Next");
  });

  it("keeps <html lang> in sync with the active language", async () => {
    await i18n.changeLanguage("fr");
    expect(document.documentElement.lang).toBe("fr");
    await i18n.changeLanguage("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
