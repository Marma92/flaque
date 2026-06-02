import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enCommon from "./locales/en/common.json";
import enPlayer from "./locales/en/player.json";
import frCommon from "./locales/fr/common.json";
import frPlayer from "./locales/fr/player.json";

export const SUPPORTED_LANGUAGES = ["en", "fr"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

/** Endonyms — each language label is shown in its own language. */
export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  fr: "Français"
};

export const LANGUAGE_STORAGE_KEY = "flaque_lang_v1";

export const defaultNS = "common";

// Resources are bundled (not lazy-loaded over HTTP) so `import "./i18n"` fully
// initialises i18next synchronously — important for tests and first paint.
export const resources = {
  en: { common: enCommon, player: enPlayer },
  fr: { common: frCommon, player: frPlayer }
} as const;

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Phase 0: detection order is localStorage → browser. The account-synced
    // preference is layered on top in Phase 1.
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ["localStorage"]
    },
    supportedLngs: [...SUPPORTED_LANGUAGES],
    fallbackLng: DEFAULT_LANGUAGE,
    // Map regional tags (e.g. "fr-FR") to the base language we ship.
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    ns: ["common", "player"],
    defaultNS,
    returnNull: false,
    interpolation: {
      // React already escapes interpolated values.
      escapeValue: false
    }
  });

// Keep <html lang> in sync with the active language for a11y / SEO.
function syncDocumentLang(lng: string): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
}

syncDocumentLang(i18n.language || DEFAULT_LANGUAGE);
i18n.on("languageChanged", syncDocumentLang);

export default i18n;
