import type { ForYouPlaylistSummary, RadioTrack, Track } from "../types";
import type { RecentUploadAlbum, RecentUploadItem } from "../api";
import type { UploadPeriod } from "../hooks/useRecentlyUploaded";
import { HomeForYouRow } from "./HomeForYouRow";
import { RecentTracksPanel } from "./RecentTracksPanel";
import { RecentlyUploadedPanel } from "./RecentlyUploadedPanel";
import { ResumeRow } from "./ResumeRow";

export type ResumeRowState = {
  track: Track;
  positionSec: number;
};

export type HomePanelsProps = {
  recentTracks: Track[];
  onRecentTrackReplay: (track: Track) => void;
  recentlyUploadedItems: RecentUploadItem[];
  recentlyUploadedLoading: boolean;
  recentlyUploadedPeriod: UploadPeriod;
  onRecentlyUploadedPeriodChange: (period: UploadPeriod) => void;
  onRecentlyUploadedTrackSelect: (track: Track) => void;
  onRecentlyUploadedAlbumPlay: (album: RecentUploadAlbum) => void;
  onRecentlyUploadedAlbumOpen: (album: RecentUploadAlbum) => void;
  ownerNameById?: Record<string, string>;
  onNavigateToLibrary?: () => void;
  radioLoading?: boolean;
  radioStationId?: string | null;
  radioCurrentTrack?: RadioTrack | null;
  radioNextTrack?: RadioTrack | null;
  onStartRadioPlayback?: () => void;
  resumeState?: ResumeRowState | null;
  onResume?: (track: Track, positionSec: number) => void;
  onDismissResume?: () => void;
  forYouPlaylists?: ForYouPlaylistSummary[];
  onSelectForYouPlaylist?: (playlistId: string) => void;
  onNavigateToPlaylists?: () => void;
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
  onRecentlyUploadedAlbumPlay,
  onRecentlyUploadedAlbumOpen,
  ownerNameById,
  onNavigateToLibrary,
  radioLoading = false,
  radioStationId = null,
  radioCurrentTrack = null,
  radioNextTrack = null,
  onStartRadioPlayback,
  resumeState = null,
  onResume,
  onDismissResume,
  forYouPlaylists = [],
  onSelectForYouPlaylist,
  onNavigateToPlaylists
}: HomePanelsProps): JSX.Element | null {
  const hasRecent = recentTracks.length > 0;
  const hasUploaded = recentlyUploadedItems.length > 0 || recentlyUploadedLoading;
  const hasForYou = forYouPlaylists.length > 0 && Boolean(onSelectForYouPlaylist);
  const canStartRadio = Boolean(onStartRadioPlayback && !radioLoading);

  const cardGridClass = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <div className="space-y-4 m-4">
      <section className="rounded-xl border border-flaque-clay/60 bg-white/80 p-4 shadow-panel backdrop-blur-sm">
        <div className="flex items-stretch gap-3">
          <button
            type="button"
            disabled={!canStartRadio}
            onClick={() => onStartRadioPlayback?.()}
            className="radio-play-btn shrink-0 flex w-20 flex-col items-center justify-center rounded-lg cursor-pointer disabled:cursor-not-allowed sm:w-24 mb-[5px]"
            aria-label="Launch radio"
            title="Launch radio"
          >
            <svg className="h-7 w-7 drop-shadow-sm sm:h-8 sm:w-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 6v12l10-6-10-6z" />
            </svg>
            <span className="mt-1 font-display text-[10px] font-semibold tracking-[0.25em]">PLAY</span>
          </button>

          <button
            className="radio-screen font-lcd flex-1 min-w-0 rounded-xl px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70"
            type="button"
            disabled={!canStartRadio}
            onClick={() => onStartRadioPlayback?.()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-current/20 pb-1">
              <p className="truncate text-sm font-bold tracking-[0.25em]">FLAQUE FM</p>
              <p className="radio-screen-subtle shrink-0 text-[10px] uppercase tracking-[0.3em]">Now Playing</p>
            </div>
            {radioLoading ? (
              <p className="radio-screen-subtle mt-2 text-sm">Syncing station state...</p>
            ) : radioCurrentTrack ? (
              <>
                <p className="mt-2 truncate text-lg" title={radioCurrentTrack.title ?? "Untitled"}>
                  {radioCurrentTrack.title ?? "Untitled"}
                </p>
                <p className="radio-screen-subtle mt-1 truncate text-sm">
                  {radioCurrentTrack.artist ?? "Unknown artist"}
                  {radioCurrentTrack.album ? ` - ${radioCurrentTrack.album}` : ""}
                </p>
              </>
            ) : (
              <p className="radio-screen-subtle mt-2 text-sm">No active track yet.</p>
            )}
          </button>
        </div>
      </section>

      {resumeState && onResume && onDismissResume ? (
        <ResumeRow
          track={resumeState.track}
          positionSec={resumeState.positionSec}
          onResume={onResume}
          onDismiss={onDismissResume}
        />
      ) : null}

      {hasForYou && onSelectForYouPlaylist ? (
        <HomeForYouRow
          playlists={forYouPlaylists}
          onSelect={onSelectForYouPlaylist}
        />
      ) : null}

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
          onAlbumPlay={onRecentlyUploadedAlbumPlay}
          onAlbumOpen={onRecentlyUploadedAlbumOpen}
          ownerNameById={ownerNameById}
        />
      ) : null}

      {!hasRecent && !hasUploaded && !resumeState && !hasForYou ? (
        <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-flaque-clay/60 bg-white/80 p-8 text-center">
          <div className="text-sm text-flaque-steel">
            <p className="font-bold text-flaque-ink">Oh flaque !</p>
            <p className="mt-1">Nothing to play here at the moment. Where would you like to start ?</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onStartRadioPlayback ? (
              <button
                className="inline-flex items-center gap-1.5 rounded-xl border border-flaque-clay/60 bg-flaque-cream/80 px-3 py-2 text-sm font-medium text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={!canStartRadio}
                onClick={() => onStartRadioPlayback?.()}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 6v12l10-6-10-6z" />
                </svg>
                Tune in to FLAQUE FM
              </button>
            ) : null}
            {onNavigateToLibrary ? (
              <button
                className="inline-flex items-center gap-1.5 rounded-xl border border-flaque-clay/60 bg-flaque-cream/80 px-3 py-2 text-sm font-medium text-flaque-ink transition hover:bg-flaque-cream"
                type="button"
                onClick={onNavigateToLibrary}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                </svg>
                Browse library
              </button>
            ) : null}
            {onNavigateToPlaylists ? (
              <button
                className="inline-flex items-center gap-1.5 rounded-xl border border-flaque-clay/60 bg-flaque-cream/80 px-3 py-2 text-sm font-medium text-flaque-ink transition hover:bg-flaque-cream"
                type="button"
                onClick={onNavigateToPlaylists}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                View playlists
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
