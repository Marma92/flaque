import type { Track } from "../types";
import { AudioPlayer, type TranscodeMode } from "./AudioPlayer";

type PlayerViewProps = {
  track: Track | null;
  onPrevious?: () => Promise<void> | void;
  onNext?: () => Promise<void> | void;
  onTrackPlayed?: (track: Track) => void;
  transcodeMode?: TranscodeMode;
  onTranscodeModeChange?: (mode: TranscodeMode) => void;
  playRequestNonce?: number;
};

export function PlayerView({
  track,
  onPrevious,
  onNext,
  onTrackPlayed,
  transcodeMode,
  onTranscodeModeChange,
  playRequestNonce
}: PlayerViewProps): JSX.Element {
  const shouldRenderEmbeddedPlayer = Boolean(
    onPrevious || onNext || onTrackPlayed || onTranscodeModeChange || transcodeMode !== undefined || playRequestNonce !== undefined
  );

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-flaque-steel">Now playing</p>
        <h2 className="mt-2 font-display text-3xl text-flaque-ink">Hi-Fi Player</h2>
        <p className="mt-3 text-sm text-flaque-steel">
          FLAC files are streamed without transcoding when possible, with byte-range seek support.
        </p>
        <p className="mt-3 text-sm text-flaque-steel">
          {track
            ? "The current track keeps playing while you navigate between views."
            : "Select a track in Library to start playback."}
        </p>
      </section>

      {shouldRenderEmbeddedPlayer ? (
        <AudioPlayer
          track={track}
          expanded
          onPrevious={onPrevious}
          onNext={onNext}
          onTrackPlayed={onTrackPlayed}
          transcodeMode={transcodeMode}
          onTranscodeModeChange={onTranscodeModeChange}
          playRequestNonce={playRequestNonce}
        />
      ) : null}
    </div>
  );
}
