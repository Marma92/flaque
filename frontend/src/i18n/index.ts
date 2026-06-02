import { DEFAULT_LANGUAGE, isSupportedLanguage, SUPPORTED_LANGUAGES, type UserLanguage } from "@flaque/shared";
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enAccount from "./locales/en/account.json";
import enAuth from "./locales/en/auth.json";
import enCommon from "./locales/en/common.json";
import enPlayer from "./locales/en/player.json";
import frAccount from "./locales/fr/account.json";
import frAuth from "./locales/fr/auth.json";
import frCommon from "./locales/fr/common.json";
import frPlayer from "./locales/fr/player.json";

// Re-export the shared language vocabulary so UI code can import everything
// i18n-related from a single module.
export { DEFAULT_LANGUAGE, isSupportedLanguage, SUPPORTED_LANGUAGES };
export type SupportedLanguage = UserLanguage;

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
  en: { common: enCommon, player: enPlayer, auth: enAuth, account: enAccount },
  fr: { common: frCommon, player: frPlayer, auth: frAuth, account: frAccount }
} as const;

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Detection order for logged-out / first paint is localStorage → browser.
    // For signed-in users the account preference is layered on top by syncing
    // i18n to `user.language` once the session loads (see useLanguageSync).
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
    ns: ["common", "player", "auth", "account"],
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
