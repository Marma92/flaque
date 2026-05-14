import { coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { Track } from "../types";
import { formatDuration } from "../utils/format";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "../utils/tracks";

type ResumeRowProps = {
  track: Track;
  positionSec: number;
  onResume: (track: Track, positionSec: number) => void;
  onDismiss: () => void;
};

/**
 * Home view affordance for picking up the last-played track where it was
 * paused, with a one-click resume and a dismiss button.
 */
export function ResumeRow({ track, positionSec, onResume, onDismiss }: ResumeRowProps): JSX.Element {
  const title = getTrackDisplayTitle(track);
  const artist = getTrackDisplayArtist(track) ?? "Unknown artist";
  const duration = track.duration || 0;
  const clampedPosition = Math.max(0, Math.min(positionSec, duration > 0 ? duration : positionSec));
  const progressPercent = duration > 0 ? Math.min(100, (clampedPosition / duration) * 100) : 0;

  return (
    <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-4 shadow-panel backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <img
          className="h-16 w-16 shrink-0 rounded-md object-cover"
          src={coverUrl(track.id, track.cover)}
          alt=""
          onError={(event) => {
            event.currentTarget.src = defaultCoverImage;
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-flaque-steel">
            Resume
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-flaque-ink" title={title}>
            {title}
          </p>
          <p className="truncate text-xs text-flaque-steel">{artist}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-flaque-clay/40">
              <div
                className="h-full rounded-full bg-flaque-ink/70"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-flaque-steel">
              {formatDuration(clampedPosition)}
              {duration > 0 ? ` / ${formatDuration(duration)}` : ""}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1.5">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-flaque-ink px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-flaque-cream transition hover:bg-flaque-ink/90"
            onClick={() => onResume(track, clampedPosition)}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 6v12l10-6-10-6z" />
            </svg>
            Resume
          </button>
          <button
            type="button"
            className="rounded-xl border border-flaque-clay/60 bg-white px-3 py-1 text-[11px] text-flaque-steel transition hover:bg-flaque-cream hover:text-flaque-ink"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}
