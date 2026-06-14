export const SUPPORTED_LANGUAGES = ["en", "fr"] as const;

export type UserLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: UserLanguage = "en";

export function isSupportedLanguage(value: unknown): value is UserLanguage {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Coerce any stored/raw value to a supported language, falling back to the default. */
export function normalizeLanguage(value: unknown): UserLanguage {
  return isSupportedLanguage(value) ? value : DEFAULT_LANGUAGE;
}
