import { KeyboardEvent } from "react";

import type { Track } from "../types";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayTitle
} from "../utils/tracks";

type TrackListProps = {
  tracks: Track[];
  currentTrackId?: string;
  ownerNameById?: Record<string, string>;
  onTrackSelect: (track: Track) => void;
  emptyMessage?: string;
};

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function TrackList({
  tracks,
  currentTrackId,
  ownerNameById,
  onTrackSelect,
  emptyMessage = "No tracks match this filter yet."
}: TrackListProps): JSX.Element {
  const resolveOwnerLabel = (owner: string): string => ownerNameById?.[owner] ?? owner;

  function handleTrackRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, track: Track): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onTrackSelect(track);
  }

  return (
    <>
      <div className="space-y-3 p-4 md:hidden">
        {tracks.map((track) => {
          const selected = track.id === currentTrackId;
          const trackTitle = getTrackDisplayTitle(track);
          const trackArtist = getTrackDisplayArtist(track) ?? "Unknown";
          const trackAlbum = getTrackDisplayAlbumWithYear(track) ?? "Unknown";

          return (
            <button
              key={track.id}
              className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                selected
                  ? "border-flaque-ink bg-flaque-ink text-flaque-cream"
                  : "border-flaque-clay/60 bg-flaque-cream/45 text-flaque-ink hover:bg-flaque-cream"
              }`}
              type="button"
              onClick={() => onTrackSelect(track)}
            >
              <p className="truncate text-sm font-medium" title={trackTitle}>
                {trackTitle}
              </p>
              <p className={`mt-1 truncate text-xs ${selected ? "text-flaque-cream/85" : "text-flaque-steel"}`}>
                {trackArtist}
              </p>
              <p className={`truncate text-xs ${selected ? "text-flaque-cream/75" : "text-flaque-steel/80"}`}>
                {trackAlbum}
              </p>

              <div
                className={`mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.12em] ${
                  selected ? "text-flaque-cream/75" : "text-flaque-steel/85"
                }`}
              >
                <span>{resolveOwnerLabel(track.owner)}</span>
                <span>
                  {formatDuration(track.duration)} - {track.codec}
                </span>
              </div>
            </button>
          );
        })}

        {tracks.length === 0 ? <p className="text-sm text-flaque-steel">{emptyMessage}</p> : null}
      </div>

      <div className="hidden max-h-[50vh] overflow-auto md:block">
        <table className="w-full min-w-[780px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Artist</th>
              <th className="px-4 py-3 font-medium">Album</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Codec</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => {
              const selected = track.id === currentTrackId;
              const trackTitle = getTrackDisplayTitle(track);
              const trackArtist = getTrackDisplayArtist(track) ?? "Unknown";
              const trackAlbum = getTrackDisplayAlbumWithYear(track) ?? "Unknown";
              return (
                <tr
                  key={track.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Play ${trackTitle}`}
                  className={`cursor-pointer border-t border-flaque-clay/40 transition ${
                    selected ? "bg-flaque-sand/20" : "hover:bg-flaque-cream/60"
                  }`}
                  onClick={() => onTrackSelect(track)}
                  onKeyDown={(event) => handleTrackRowKeyDown(event, track)}
                >
                  <td className="px-4 py-3 text-flaque-ink">
                    <span className="block max-w-[24rem] truncate" title={trackTitle}>
                      {trackTitle}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-flaque-steel">{trackArtist}</td>
                  <td className="px-4 py-3 text-flaque-steel">{trackAlbum}</td>
                  <td className="px-4 py-3 text-flaque-steel">{resolveOwnerLabel(track.owner)}</td>
                  <td className="px-4 py-3 text-flaque-steel">{formatDuration(track.duration)}</td>
                  <td className="px-4 py-3 uppercase text-flaque-steel">{track.codec}</td>
                </tr>
              );
            })}
            {tracks.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-flaque-steel" colSpan={6}>
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
