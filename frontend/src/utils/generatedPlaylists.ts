import type { TFunction } from "i18next";

import type { AutoAxis, ForYouNameVariant, PersonalVariantId, TempoBucket } from "../types";

/**
 * Localized display names/descriptions for server-generated playlists.
 *
 * The backend emits English prose names for personal / auto / for-you
 * playlists, but each carries the structured fields that produced it
 * (variant, genre/decade/tempo, …). We re-derive the visible name on the
 * client from those fields so it follows the active language, rather than
 * showing the server's English string.
 */

/** "1980" → "80s", "2000" → "2000s" (matches the backend decade label). */
export function decadeLabel(decade: number): string {
  return `${decade % 100 === 0 ? decade : decade % 100}s`;
}

export function autoPlaylistName(
  t: TFunction,
  playlist: { axis?: AutoAxis; genre: string; decade: number; tempo?: TempoBucket }
): string {
  if (playlist.axis === "genre-tempo" && playlist.tempo) {
    return t("playlists:generatedNames.auto.tempoGenre", {
      tempo: t(`playlists:generatedNames.auto.tempoName.${playlist.tempo}`),
      genre: playlist.genre
    });
  }
  return t("playlists:generatedNames.auto.decadeGenre", {
    decadeLabel: decadeLabel(playlist.decade),
    genre: playlist.genre
  });
}

export function personalPlaylistName(t: TFunction, variant: PersonalVariantId): string {
  return t(`playlists:generatedNames.personal.${variant}.name`);
}

export function personalPlaylistDescription(t: TFunction, variant: PersonalVariantId): string {
  return t(`playlists:generatedNames.personal.${variant}.description`);
}

export function forYouPlaylistName(
  t: TFunction,
  playlist: { name: string; seedArtist: string; nameVariant?: ForYouNameVariant; nameDecadeLabel?: string }
): string {
  // Old playlists predate the structured descriptor — keep their English name.
  if (!playlist.nameVariant) {
    return playlist.name;
  }
  return t(`playlists:generatedNames.forYou.${playlist.nameVariant}`, {
    artist: playlist.seedArtist,
    decadeLabel: playlist.nameDecadeLabel ?? ""
  });
}
