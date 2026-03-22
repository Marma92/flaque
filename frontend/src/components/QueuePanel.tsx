import type { Track } from "../types";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "../utils/tracks";

type QueuePanelProps = {
  tracks: Track[];
  currentIndex: number;
  expanded: boolean;
  onTrackSelect?: (track: Track) => void;
};

export function QueuePanel({ tracks, currentIndex, expanded, onTrackSelect }: QueuePanelProps): JSX.Element {
  const containerClassName = expanded
    ? "rounded-2xl border border-flaque-clay/60 bg-flaque-cream/35 p-3"
    : "rounded-xl border border-flaque-clay/60 bg-flaque-cream/45 p-2.5";
  const listClassName = expanded
    ? "mt-2 max-h-56 space-y-1.5 overflow-auto pr-1"
    : "mt-2 max-h-36 space-y-1 overflow-auto pr-1";

  return (
    <div className={containerClassName}>
      <p className="text-xs uppercase tracking-[0.2em] text-flaque-steel">Current queue</p>
      <div className={listClassName}>
        {tracks.map((queueTrack, index) => {
          const isCurrent = index === currentIndex;
          const isPlayed = index < currentIndex;
          const title = getTrackDisplayTitle(queueTrack);
          const artist = getTrackDisplayArtist(queueTrack) ?? "Unknown artist";

          const stateLabel = isCurrent ? "Now" : isPlayed ? "Played" : "Next";
          const rowClassName = isCurrent
            ? "border-flaque-sand/80 bg-white text-flaque-ink shadow-sm"
            : isPlayed
              ? "border-flaque-clay/40 bg-flaque-cream/60 text-flaque-steel/70 opacity-70"
              : "border-flaque-clay/50 bg-white/80 text-flaque-ink";

          return (
            <button
              key={`${queueTrack.id}-${index}`}
              className={`flex w-full items-center gap-2 rounded-xl border ${
                expanded ? "px-2.5 py-2" : "px-2 py-1.5"
              } text-left transition ${rowClassName} ${
                onTrackSelect ? "hover:bg-flaque-cream" : "cursor-default"
              }`}
              type="button"
              onClick={() => {
                if (onTrackSelect) {
                  onTrackSelect(queueTrack);
                }
              }}
              disabled={!onTrackSelect}
              title={title}
            >
              <span
                className={`${expanded ? "w-12" : "w-10"} shrink-0 text-[10px] uppercase tracking-[0.16em] text-flaque-steel/80`}
              >
                {stateLabel}
              </span>
              <span className="min-w-0">
                <span className={`block truncate font-medium ${expanded ? "text-sm" : "text-xs"}`}>{title}</span>
                <span
                  className={`block truncate ${expanded ? "text-xs text-flaque-steel/85" : "text-[11px] text-flaque-steel/80"}`}
                >
                  {artist}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
