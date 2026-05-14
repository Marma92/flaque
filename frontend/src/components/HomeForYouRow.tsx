import { coverPathUrl } from "../api";
import type { ForYouPlaylistSummary } from "../types";

type HomeForYouRowProps = {
  playlists: ForYouPlaylistSummary[];
  onSelect: (playlistId: string) => void;
};

/**
 * Home view row of For-You playlists. Horizontally scrollable on overflow.
 * Renders the seed-artist photo when available, falling back to a gradient
 * tile with the first letter (matching the Playlists tab pattern). The
 * caller decides ordering — by default the API returns alphabetically.
 */
export function HomeForYouRow({ playlists, onSelect }: HomeForYouRowProps): JSX.Element | null {
  if (playlists.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h2 className="font-display text-xl text-flaque-ink">Made for you</h2>
      <div
        className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]"
        role="list"
      >
        {playlists.map((playlist) => {
          const photoUrl = playlist.seedArtistPhoto ? coverPathUrl(playlist.seedArtistPhoto) : null;
          return (
            <button
              key={playlist.id}
              type="button"
              role="listitem"
              className="group flex w-32 shrink-0 cursor-pointer flex-col overflow-hidden rounded-2xl bg-white/85 text-left shadow-sm transition hover:shadow-md sm:w-36"
              onClick={() => onSelect(playlist.id)}
              title={playlist.name}
            >
              <div className="relative aspect-square w-full overflow-hidden">
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={playlist.seedArtist}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-flaque-cream to-flaque-clay/60 text-flaque-steel">
                    <span className="font-display text-3xl">
                      {playlist.seedArtist.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                  <svg className="h-8 w-8 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                    <path d="M8 6v12l10-6-10-6z" />
                  </svg>
                </div>
              </div>
              <div className="px-2 py-1.5">
                <p className="line-clamp-2 min-h-[2rem] text-[11px] font-semibold text-flaque-ink">
                  {playlist.name}
                </p>
                <p className="mt-0.5 text-[10px] text-flaque-steel">
                  {playlist.trackCount} track{playlist.trackCount !== 1 ? "s" : ""}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
