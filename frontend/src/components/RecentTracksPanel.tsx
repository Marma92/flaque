import type { Track } from "../types";
import { TrackCardGrid } from "./TrackCardGrid";

type RecentTracksPanelProps = {
  tracks: Track[];
  onTrackReplay: (track: Track) => void;
  gridClassName?: string;
};

/**
 * Compact list of recently played tracks shown in the Library view.
 */
export function RecentTracksPanel({ tracks, onTrackReplay, gridClassName }: RecentTracksPanelProps): JSX.Element | null {
  if (tracks.length === 0) {
    return null;
  }

  const visibleTracks = tracks.slice(0, 12);

  return (
    <section className="border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h2 className="font-display text-xl text-flaque-ink">Played Recently</h2>
      <TrackCardGrid tracks={visibleTracks} onTrackSelect={onTrackReplay} gridClassName={gridClassName} />
    </section>
  );
}
