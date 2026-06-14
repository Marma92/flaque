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
    <section className="border border-flaque-clay/60 bg-white/85 p-3 shadow-panel backdrop-blur-sm md:p-5">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
          {sectionKeys.map((sectionKey) => (
            <button
              key={sectionKey}
              className={`min-w-[6rem] rounded-xl px-2.5 py-1.5 text-center text-[11px] font-medium uppercase tracking-[0.12em] transition ${
                activeSection === sectionKey
                  ? "bg-flaque-ink text-flaque-cream"
                  : "border border-flaque-clay bg-white text-flaque-ink hover:bg-flaque-cream"
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
