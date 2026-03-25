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
};

/**
 * Layout wrapper for the Recently Played and Recently Uploaded panels.
 * Side-by-side on desktop when both are visible, full-width when only one is.
 */
export function HomePanels({
  recentTracks,
  onRecentTrackReplay,
  recentlyUploadedTracks,
  recentlyUploadedLoading,
  recentlyUploadedPeriod,
  onRecentlyUploadedPeriodChange,
  onRecentlyUploadedTrackSelect
}: HomePanelsProps): JSX.Element | null {
  const hasRecent = recentTracks.length > 0;
  const hasUploaded = recentlyUploadedTracks.length > 0 || recentlyUploadedLoading;
  const bothVisible = hasRecent && hasUploaded;

  if (!hasRecent && !hasUploaded) {
    return null;
  }

  // 3 cols when side-by-side (3×4=12), 4 cols when alone (4×3=12)
  const cardGridClass = bothVisible
    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  const containerClass = bothVisible
    ? "grid grid-cols-1 gap-4 lg:grid-cols-2"
    : "";

  return (
    <div className={containerClass}>
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
        />
      ) : null}
    </div>
  );
}
