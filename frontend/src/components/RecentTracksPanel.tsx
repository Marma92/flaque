import { coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { Track } from "../types";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayTitle
} from "../utils/tracks";

type RecentTracksPanelProps = {
  tracks: Track[];
  onTrackReplay: (track: Track) => void;
};

/**
 * Compact list of recently played tracks shown in the Library view.
 */
export function RecentTracksPanel({ tracks, onTrackReplay }: RecentTracksPanelProps): JSX.Element | null {
  if (tracks.length === 0) {
    return null;
  }

  const visibleTracks = tracks.slice(0, 12);

  return (
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h2 className="font-display text-xl text-flaque-ink">Played Recently</h2>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleTracks.map((track) => {
          const title = getTrackDisplayTitle(track);
          const artist = getTrackDisplayArtist(track) ?? "Unknown artist";
          const albumWithYear = getTrackDisplayAlbumWithYear(track);

          return (
            <button
              key={track.id}
              className="w-full justify-self-start rounded-xl border border-flaque-clay/60 bg-flaque-cream/50 px-2.5 py-2 text-left transition hover:bg-flaque-cream sm:max-w-[18.5rem]"
              type="button"
              onClick={() => onTrackReplay(track)}
              title={title}
            >
              <div className="flex items-center gap-2.5">
                <img
                  className="h-10 w-10 shrink-0 rounded-lg border border-flaque-clay/50 object-cover"
                  src={coverUrl(track.id, track.cover)}
                  alt={albumWithYear ? `Cover for ${albumWithYear}` : `Cover for ${title}`}
                  onError={(event) => {
                    event.currentTarget.src = defaultCoverImage;
                  }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-flaque-ink">{title}</p>
                  <p className="truncate text-xs text-flaque-steel">
                    {artist}
                    {albumWithYear ? ` - ${albumWithYear}` : ""}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
