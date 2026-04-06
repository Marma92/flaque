import type { Track } from "../types";
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
  onNavigateToLibrary
}: HomePanelsProps): JSX.Element | null {
  const hasRecent = recentTracks.length > 0;
  const hasUploaded = recentlyUploadedTracks.length > 0 || recentlyUploadedLoading;

  if (!hasRecent && !hasUploaded) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
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
    );
  }

  const cardGridClass = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <div className="space-y-4 m-4">
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
    </div>
  );
}
