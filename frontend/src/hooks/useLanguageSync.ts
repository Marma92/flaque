import { isSupportedLanguage } from "@flaque/shared";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { User } from "../types";

/**
 * Layers the signed-in user's account language preference on top of the
 * localStorage/browser detection: whenever the loaded user carries a supported
 * language that differs from the active one, switch i18n to it. Logged-out and
 * first-paint states keep the detector's choice.
 */
export function useLanguageSync(user: User | null): void {
  const { i18n } = useTranslation();
  const preferred = user?.language;

  useEffect(() => {
    if (isSupportedLanguage(preferred) && i18n.resolvedLanguage !== preferred) {
      void i18n.changeLanguage(preferred);
    }
  }, [i18n, preferred]);
}
