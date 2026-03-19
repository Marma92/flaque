type LibrarySection = "music" | "artists" | "albums" | "playlist";

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
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-flaque-steel">Library</p>
          <h2 className="mt-1 font-display text-2xl text-flaque-ink">Music, Artists, Albums & Playlists</h2>
          <p className="mt-2 text-sm text-flaque-steel">Switch between tracks, artists, albums and playlist management.</p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end">
          {([
            ["music", "Music"],
            ["artists", "Artists"],
            ["albums", "Albums"],
            ["playlist", "Playlist"]
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
      </div>
    </section>
  );
}
