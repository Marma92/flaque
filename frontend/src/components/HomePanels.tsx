import type { RadioTrack, Track } from "../types";
import type { UploadPeriod } from "../hooks/useRecentlyUploaded";
import { RecentTracksPanel } from "./RecentTracksPanel";
import { RecentlyUploadedPanel } from "./RecentlyUploadedPanel";

type HomePanelsProps = {
  recentTracks: Track[];
  onRecentTrackReplay: (track: Track) => void;
  recentlyUploadedTracks: Track[];
  recentlyUploadedLoading: boolean;
  recentlyUploadedPeriod: UploadPeriod;
  onRecentlyUploadedPeriodChange: (period: UploadPeriod) => void;
  onRecentlyUploadedTrackSelect: (track: Track) => void;
  ownerNameById?: Record<string, string>;
  onNavigateToLibrary?: () => void;
  radioLoading?: boolean;
  radioStationId?: string | null;
  radioCurrentTrack?: RadioTrack | null;
  radioNextTrack?: RadioTrack | null;
  onStartRadioPlayback?: () => void;
};

/**
 * Layout wrapper for the Recently Played and Recently Uploaded panels.
 * Panels are always stacked vertically to preserve reading flow.
 */
export function HomePanels({
  recentTracks,
  onRecentTrackReplay,
  recentlyUploadedTracks,
  recentlyUploadedLoading,
  recentlyUploadedPeriod,
  onRecentlyUploadedPeriodChange,
  onRecentlyUploadedTrackSelect,
  ownerNameById,
  onNavigateToLibrary,
  radioLoading = false,
  radioStationId = null,
  radioCurrentTrack = null,
  radioNextTrack = null,
  onStartRadioPlayback
}: HomePanelsProps): JSX.Element | null {
  const hasRecent = recentTracks.length > 0;
  const hasUploaded = recentlyUploadedTracks.length > 0 || recentlyUploadedLoading;
  const canStartRadio = Boolean(onStartRadioPlayback && !radioLoading);

  const cardGridClass = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <div className="space-y-4 m-4">
      <section className="rounded-2xl border border-flaque-clay/60 bg-white/80 p-4 shadow-panel backdrop-blur-sm">
        <p className="text-[11px] uppercase tracking-[0.22em] text-flaque-steel">Radio</p>
        <button
          className="mt-2 w-full rounded-xl bg-flaque-ink px-4 py-3 text-left text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={!canStartRadio}
          onClick={() => onStartRadioPlayback?.()}
        >
          <p className="font-display text-xl">Launch synchronized radio</p>
          <p className="mt-1 text-sm text-flaque-cream/80">
            Shared timeline station with server-side timing and rebuilds.
          </p>
        </button>

        <button
          className="mt-3 w-full rounded-xl border border-flaque-clay/70 bg-flaque-cream/60 px-4 py-3 text-left transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-70"
          type="button"
          disabled={!canStartRadio}
          onClick={() => onStartRadioPlayback?.()}
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-flaque-steel">Now Playing</p>
          {radioLoading ? (
            <p className="mt-1 text-sm text-flaque-steel">Syncing station state...</p>
          ) : radioCurrentTrack ? (
            <>
              <p className="mt-1 truncate font-display text-lg text-flaque-ink" title={radioCurrentTrack.title ?? "Untitled"}>
                {radioCurrentTrack.title ?? "Untitled"}
              </p>
              <p className="mt-1 truncate text-sm text-flaque-steel">
                {radioCurrentTrack.artist ?? "Unknown artist"}
                {radioCurrentTrack.album ? ` - ${radioCurrentTrack.album}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-flaque-steel">No active track yet.</p>
          )}
          <p className="mt-2 text-xs text-flaque-steel/90">
            Station: {radioStationId ?? "stopped"}
            {radioNextTrack?.title ? ` · Up next: ${radioNextTrack.title}` : ""}
          </p>
        </button>
      </section>

      {hasRecent ? (
        <RecentTracksPanel
          tracks={recentTracks}
          onTrackReplay={onRecentTrackReplay}
          gridClassName={cardGridClass}
        />
      ) : null}
      {hasUploaded ? (
        <RecentlyUploadedPanel
          tracks={recentlyUploadedTracks}
          loading={recentlyUploadedLoading}
          period={recentlyUploadedPeriod}
          onPeriodChange={onRecentlyUploadedPeriodChange}
          onTrackSelect={onRecentlyUploadedTrackSelect}
          gridClassName={cardGridClass}
          ownerNameById={ownerNameById}
        />
      ) : null}

      {!hasRecent && !hasUploaded ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-flaque-clay/60 bg-white/80 p-8 text-center">
          <div className="text-sm text-flaque-steel">
            <p className="font-bold text-flaque-ink">Oh flaque !</p>
            <p className="mt-1">Nothing to play here at the moment, maybe you should browse your library ?</p>
          </div>
          {onNavigateToLibrary ? (
            <button
              className="rounded-xl border border-flaque-clay/60 bg-flaque-cream/80 px-4 py-2 text-sm font-medium text-flaque-ink transition hover:bg-flaque-cream"
              type="button"
              onClick={onNavigateToLibrary}
            >
              Browse library
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
