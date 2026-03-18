import type { Track } from "../types";
import { getTrackDisplayTitle } from "../utils/tracks";

type PlayerViewProps = {
  track: Track | null;
};

export function PlayerView({ track }: PlayerViewProps): JSX.Element {
  return (
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <p className="text-xs uppercase tracking-[0.3em] text-flaque-steel">Now playing</p>
      <h2 className="mt-2 font-display text-3xl text-flaque-ink">Hi-Fi Player</h2>
      <p className="mt-3 text-sm text-flaque-steel">
        FLAC files are streamed without transcoding when possible, with byte-range seek support.
      </p>

      {track ? (
        <div className="mt-4 rounded-2xl border border-flaque-clay/60 bg-flaque-cream/55 p-4">
          <p className="truncate font-display text-xl text-flaque-ink" title={getTrackDisplayTitle(track)}>
            {getTrackDisplayTitle(track)}
          </p>
          <p className="mt-1 text-sm text-flaque-steel">
            {track.tags.artist ?? "Unknown artist"}
            {track.tags.album ? ` - ${track.tags.album}` : ""}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-flaque-steel">Select a track from Library to start playback.</p>
      )}
    </section>
  );
}
