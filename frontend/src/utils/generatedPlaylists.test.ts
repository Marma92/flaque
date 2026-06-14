/* @vitest-environment happy-dom */

import { afterEach, describe, expect, it } from "vitest";

import i18n from "../i18n";
import {
  autoPlaylistName,
  forYouPlaylistName,
  personalPlaylistDescription,
  personalPlaylistName
} from "./generatedPlaylists";

const t = i18n.t.bind(i18n);

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("generatedPlaylists names", () => {
  it("derives auto playlist names by axis (EN matches server output)", () => {
    expect(autoPlaylistName(t, { genre: "Rock", decade: 1970 })).toBe("70s Rock");
    expect(
      autoPlaylistName(t, { axis: "genre-tempo", genre: "Metal", decade: 0, tempo: "driving" })
    ).toBe("Driving Metal");
  });

  it("localizes auto playlist names in French", async () => {
    await i18n.changeLanguage("fr");
    expect(autoPlaylistName(t, { genre: "Rock", decade: 1970 })).toBe("Rock 70s");
    expect(
      autoPlaylistName(t, { axis: "genre-tempo", genre: "Metal", decade: 0, tempo: "driving" })
    ).toBe("Metal entraînant");
  });

  it("maps personal variants to localized name + description", async () => {
    expect(personalPlaylistName(t, "discovered-this-year")).toBe("Discovered this year");
    await i18n.changeLanguage("fr");
    expect(personalPlaylistName(t, "discovered-this-year")).toBe("Découverts cette année");
    expect(personalPlaylistDescription(t, "album-deep-cuts")).toContain("albums");
  });

  it("localizes for-you names from the structured variant", async () => {
    const playlist = { name: "Because you listen to Pink Floyd", seedArtist: "Pink Floyd", nameVariant: "because" as const };
    expect(forYouPlaylistName(t, playlist)).toBe("Because you listen to Pink Floyd");
    await i18n.changeLanguage("fr");
    expect(forYouPlaylistName(t, playlist)).toBe("Parce que vous écoutez Pink Floyd");
  });

  it("falls back to the server name when no variant is present", () => {
    expect(forYouPlaylistName(t, { name: "Legacy name", seedArtist: "X" })).toBe("Legacy name");
  });
});
