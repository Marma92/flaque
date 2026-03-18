import type { Track } from "../types";
import { AudioPlayer } from "./AudioPlayer";

type PlayerViewProps = {
  track: Track | null;
  onPrevious?: () => Promise<void> | void;
  onNext?: () => Promise<void> | void;
};

export function PlayerView({ track, onPrevious, onNext }: PlayerViewProps): JSX.Element {
  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-flaque-steel">Now playing</p>
        <h2 className="mt-2 font-display text-3xl text-flaque-ink">Hi-Fi Player</h2>
        <p className="mt-3 text-sm text-flaque-steel">
          FLAC files are streamed without transcoding when possible, with byte-range seek support.
        </p>
      </section>
      <AudioPlayer track={track} expanded onPrevious={onPrevious} onNext={onNext} />
    </div>
  );
}
