import { coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { Track } from "../types";
import { formatDurationCompact } from "../utils/format";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "../utils/tracks";

type PlaylistTrackListProps = {
  tracks: Track[];
  onTrackPlay: (track: Track) => void;
  emptyMessage?: string;
};

/**
 * Framed track list shared by PlaylistDetailView, AutoPlaylistDetailView,
 * and ForYouPlaylistDetailView. Each row plays from that track on click.
 */
export function PlaylistTrackList({
  tracks,
  onTrackPlay,
  emptyMessage = "No playable tracks."
}: PlaylistTrackListProps): JSX.Element {
  return (
    <div className="rounded-2xl border border-flaque-clay/60 bg-white/85 shadow-panel backdrop-blur-sm">
      {tracks.length === 0 ? (
        <p className="px-5 py-4 text-sm text-flaque-steel">{emptyMessage}</p>
      ) : (
        <ul>
          {tracks.map((track, index) => (
            <li
              key={track.id}
              className="flex cursor-pointer items-center gap-3 border-b border-flaque-clay/20 px-4 py-2.5 last:border-b-0 transition hover:bg-flaque-cream/30"
              role="button"
              tabIndex={0}
              onClick={() => onTrackPlay(track)}
              onKeyDown={(e) => { if (e.key === "Enter") onTrackPlay(track); }}
            >
              <span className="w-6 shrink-0 text-right text-xs text-flaque-steel/50">{index + 1}</span>
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                <img
                  src={coverUrl(track.id)}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-medium text-flaque-ink">
                  {track.tags.extra?.lyrics ? (
                    <span className="shrink-0 rounded px-1 py-px font-mono text-[9px] font-bold leading-none text-flaque-steel/70 ring-1 ring-flaque-clay/60">
                      L
                    </span>
                  ) : null}
                  <span className="truncate">{getTrackDisplayTitle(track)}</span>
                </p>
                <p className="truncate text-xs text-flaque-steel">
                  {getTrackDisplayArtist(track) ?? "Unknown artist"}
                  {track.tags.album ? ` · ${track.tags.album}` : ""}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-flaque-steel/60">
                {formatDurationCompact(track.duration)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
