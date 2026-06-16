import { useTranslation } from "react-i18next";

import type { LibrarySection } from "../types/library";
import { navigateTo } from "../utils/appUtils";

type LibrarySectionSwitcherProps = {
  activeSection: LibrarySection;
  onSectionChange: (section: LibrarySection) => void;
};

/**
 * Hero card and section switcher used at the top of the library view.
 */
export function LibrarySectionSwitcher({
  activeSection,
  onSectionChange
}: LibrarySectionSwitcherProps): JSX.Element {
  const { t } = useTranslation("library");
  const sectionKeys: LibrarySection[] = ["home", "music", "artists", "albums", "playlists"];
  return (
    <section className="flaque-panel p-3 md:p-5">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
          {sectionKeys.map((sectionKey) => (
            <button
              key={sectionKey}
              className={`flaque-pill min-w-[6rem] px-2.5 py-1.5 text-[11px] uppercase tracking-[0.12em] ${
                activeSection === sectionKey ? "flaque-pill-on" : "flaque-pill-off"
              }`}
              type="button"
              onClick={() => { navigateTo("library", sectionKey); onSectionChange(sectionKey); }}
            >
              {t(`sections.${sectionKey}`)}
            </button>
          ))}
      </div>
    </section>
  );
}
