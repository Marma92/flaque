import type { LibrarySection } from "../types/library";

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
  return (
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-3 shadow-panel backdrop-blur-sm md:p-5">
      <div className="flex flex-wrap items-center justify-center gap-1.5">
          {([
            ["music", "Music"],
            ["artists", "Artists"],
            ["albums", "Albums"],
            ["playlists", "Playlists"]
          ] as const).map(([sectionKey, sectionLabel]) => (
            <button
              key={sectionKey}
              className={`min-w-[6rem] rounded-xl px-2.5 py-1.5 text-center text-[11px] font-medium uppercase tracking-[0.12em] transition ${
                activeSection === sectionKey
                  ? "bg-flaque-ink text-flaque-cream"
                  : "border border-flaque-clay bg-white text-flaque-ink hover:bg-flaque-cream"
              }`}
              type="button"
              onClick={() => onSectionChange(sectionKey)}
            >
              {sectionLabel}
            </button>
          ))}
      </div>
    </section>
  );
}
