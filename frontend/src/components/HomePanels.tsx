import type { RadioTrack, Track } from "../types";
import type { RecentUploadItem } from "../api";
import type { UploadPeriod } from "../hooks/useRecentlyUploaded";
import { RecentTracksPanel } from "./RecentTracksPanel";
import { RecentlyUploadedPanel } from "./RecentlyUploadedPanel";

export type HomePanelsProps = {
  recentTracks: Track[];
  onRecentTrackReplay: (track: Track) => void;
  recentlyUploadedItems: RecentUploadItem[];
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
  recentlyUploadedItems,
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
  const hasUploaded = recentlyUploadedItems.length > 0 || recentlyUploadedLoading;
  const canStartRadio = Boolean(onStartRadioPlayback && !radioLoading);

  const cardGridClass = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <div className="space-y-4 m-4">
      <section className="rounded-xl border border-flaque-clay/60 bg-white/80 p-4 shadow-panel backdrop-blur-sm">
        <button
          className="mt-2 w-full rounded-xl bg-flaque-ink cursor-pointer px-4 py-3 text-left text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          disabled={!canStartRadio}
          onClick={() => onStartRadioPlayback?.()}
        >
          <p className="flex items-center gap-2 font-display text-xl">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 6v12l10-6-10-6z" />
            </svg>
            <span>Launch radio</span>
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
          {/* <p className="mt-2 text-xs text-flaque-steel/90">
            Station: {radioStationId ?? "stopped"}
            {radioNextTrack?.title ? ` · Up next: ${radioNextTrack.title}` : ""}
          </p> */}
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
          items={recentlyUploadedItems}
          loading={recentlyUploadedLoading}
          period={recentlyUploadedPeriod}
          onPeriodChange={onRecentlyUploadedPeriodChange}
          onTrackSelect={onRecentlyUploadedTrackSelect}
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
