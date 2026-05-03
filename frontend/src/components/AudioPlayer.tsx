import { useEffect, useMemo, useState } from "react";

import { coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import { useAudioPlayback, type RepeatMode, type TranscodeMode } from "../hooks/useAudioPlayback";
import type { Playlist, Track } from "../types";
import { formatDuration } from "../utils/format";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayLyrics,
  getTrackDisplayTitle,
  getTrackSyncedLyrics
} from "../utils/tracks";
import { PlaylistPicker } from "./PlaylistPicker";
import { QueuePanel } from "./QueuePanel";
import { SyncedLyricsOverlay } from "./SyncedLyricsOverlay";

export type { TranscodeMode, RepeatMode };

type NavigateOptions = {
  wrap?: boolean;
};

type AudioPlayerProps = {
  track: Track | null;
  expanded?: boolean;
  onPrevious?: (options?: NavigateOptions) => Promise<void> | void;
  onNext?: (options?: NavigateOptions) => Promise<void> | void;
  onTrackPlayed?: (track: Track) => void;
  onTrackSkipped?: (track: Track) => void;
  transcodeMode?: TranscodeMode;
  onTranscodeModeChange?: (mode: TranscodeMode) => void;
  repeatMode?: RepeatMode;
  onRepeatModeChange?: (mode: RepeatMode) => void;
  shuffleEnabled?: boolean;
  onShuffleEnabledChange?: (enabled: boolean) => void;
  playRequestNonce?: number;
  playRequestOffsetSec?: number;
  seekLocked?: boolean;
  radioStopped?: boolean;
  onStopRadioPlayback?: () => void;
  onResumeRadioPlayback?: () => Promise<void> | void;
  playlists?: Playlist[];
  onAddTrackToPlaylist?: (input: { trackId: string; playlistId: string }) => Promise<void> | void;
  queueTracks?: Track[];
  currentQueueTrackId?: string | null;
  onQueueTrackSelect?: (track: Track) => void;
  onArtworkClick?: () => void;
  onNavigateToLibrary?: () => void;
  onOpenTrackArtist?: () => void;
  onOpenTrackAlbum?: () => void;
};

export function AudioPlayer({
  track,
  expanded = false,
  onPrevious,
  onNext,
  onTrackPlayed,
  onTrackSkipped,
  transcodeMode = "original",
  onTranscodeModeChange,
  repeatMode = "off",
  onRepeatModeChange,
  shuffleEnabled = false,
  onShuffleEnabledChange,
  playRequestNonce = 0,
  playRequestOffsetSec = 0,
  seekLocked = false,
  radioStopped = false,
  onStopRadioPlayback,
  onResumeRadioPlayback,
  playlists = [],
  onAddTrackToPlaylist,
  queueTracks = [],
  currentQueueTrackId = null,
  onQueueTrackSelect,
  onArtworkClick,
  onNavigateToLibrary,
  onOpenTrackArtist,
  onOpenTrackAlbum
}: AudioPlayerProps): JSX.Element {
  const {
    audioRef, streamSource,
    isPlaying, currentTime, duration, volume, muted,
    canTranscode, effectiveTranscode,
    pausePlayback, onTogglePlayback, onSeek, onEnded,
    onCycleRepeatMode, onToggleShuffle,
    handleTranscodeModeChange, handleVolumeChange, setMuted,
    handleAudioPlay, handleAudioPause, handleAudioTimeUpdate, handleAudioLoadedMetadata
  } = useAudioPlayback({
    track, transcodeMode, onTranscodeModeChange,
    repeatMode, onRepeatModeChange,
    shuffleEnabled, onShuffleEnabledChange,
    playRequestNonce, playRequestOffsetSec, onNext, onPrevious, onTrackPlayed, onTrackSkipped
  });

  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [showQueuePanel, setShowQueuePanel] = useState(false);
  const [showLyricsOverlay, setShowLyricsOverlay] = useState(false);
  const [showMobileUtilityPanel, setShowMobileUtilityPanel] = useState(false);

  useEffect(() => {
    setShowLyricsOverlay(false);
    setShowMobileUtilityPanel(false);
  }, [track?.id]);

  useEffect(() => {
    if (!expanded) {
      setShowLyricsOverlay(false);
    }
  }, [expanded]);

  useEffect(() => {
    if (seekLocked) {
      setShowQueuePanel(false);
    }
  }, [seekLocked]);

  if (!track) {
    return (
      <section className={expanded
        ? "flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl m-4 border border-flaque-clay/50 bg-white/75 p-6 shadow-panel backdrop-blur-sm"
        : "rounded-3xl border border-flaque-clay/60 bg-white/85 p-6 shadow-panel backdrop-blur-sm"
      }>
        <h2 className="font-display text-xl text-flaque-ink">Player</h2>
        <p className="mt-2 text-sm text-flaque-steel">
          Select a track from the library to start streaming.
        </p>
        {onNavigateToLibrary ? (
          <button
            className="mt-4 rounded-xl border border-flaque-clay/60 bg-flaque-cream/80 px-4 py-2 text-sm font-medium text-flaque-ink transition hover:bg-flaque-sand"
            type="button"
            onClick={onNavigateToLibrary}
          >
            Browse library
          </button>
        ) : null}
      </section>
    );
  }

  const artworkSize = expanded ? "h-80 w-80 md:h-96 md:w-96" : "h-16 w-16 md:h-20 md:w-20";
  const contentLayoutClass = expanded ? "w-full space-y-4" : "min-w-0 flex-1 space-y-1";
  const controlsLayoutClass = expanded
    ? "grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3"
    : "grid w-full grid-cols-[1fr_auto_1fr] items-center justify-items-center";
  const primaryControlsClassName = expanded
    ? "flex items-center gap-2"
    : "flex justify-self-start items-center gap-1";
  const centerControlsClassName = expanded
    ? "flex shrink-0 items-center gap-2"
    : "flex justify-self-center items-center gap-3 lg:-translate-x-[46px]";
  const trailingControlsClassName = expanded
    ? "flex items-center justify-end gap-2"
    : "flex justify-self-end items-center gap-1";
  const sectionClassName = expanded
    ? "flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl mx-4 my-4 xl:mx-2 xl:my-2 border border-flaque-clay/50 bg-white/75 p-6 shadow-panel backdrop-blur-sm md:p-8"
    : "rounded-t-3xl border border-flaque-clay/60 bg-white/90 p-4 pb-1 pt-1 shadow-panel backdrop-blur-sm md:p-6 md:pb-1.5 md:pt-1.5";
  const artworkClassName = expanded
    ? `${artworkSize} shrink-0 rounded-2xl object-cover shadow-md`
    : `${artworkSize} shrink-0 rounded-2xl border border-flaque-clay/50 object-cover`;
  const secondaryTextClassName = expanded ? "truncate text-sm text-flaque-steel/90" : "overflow-x-auto scrollbar-hide whitespace-nowrap text-sm text-flaque-steel";
  const metaTextClassName = expanded ? "text-xs uppercase tracking-[0.2em] text-flaque-steel/70" : "font-body text-[10px] text-flaque-steel/80";
  const textBlockClassName = expanded ? "space-y-1" : "space-y-0.5";
  const ghostControlButtonClassName = expanded
    ? "flex h-9 w-9 items-center justify-center rounded-xl bg-flaque-cream/80 text-flaque-ink transition hover:bg-flaque-sand disabled:cursor-not-allowed disabled:opacity-60"
    : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-flaque-clay bg-white text-flaque-ink transition hover:bg-flaque-sand disabled:cursor-not-allowed disabled:opacity-60";
  const qualitySelectClassName = expanded
    ? "rounded-lg bg-flaque-cream/90 px-2 py-1 text-xs text-flaque-ink"
    : "rounded-lg border border-flaque-clay bg-white px-2 py-1 text-xs text-flaque-ink";
  const playlistButtonClassName = `${ghostControlButtonClassName} ${
    showPlaylistPicker ? "ring-2 ring-flaque-sand/55" : ""
  }`;
  const queueButtonClassName = `${ghostControlButtonClassName} ${
    showQueuePanel ? "ring-2 ring-flaque-sand/55" : ""
  }`;
  const displayTitle = getTrackDisplayTitle(track);
  const trackArtist = getTrackDisplayArtist(track);
  const displayArtist = trackArtist ?? "Unknown artist";
  const displayAlbumWithYear = getTrackDisplayAlbumWithYear(track);
  const displayLyrics = getTrackDisplayLyrics(track);
  const syncedLyrics = useMemo(() => getTrackSyncedLyrics(track), [track]);
  const hasLyrics = Boolean(displayLyrics);
  const isRadioMode = track.owner === "radio";
  const isRadioStopped = isRadioMode && radioStopped;
  const codecLabel = `${track.codec}${track.sampleRate ? ` - ${Math.round(track.sampleRate / 1000)} kHz` : ""}`;
  const canOpenTrackArtist = Boolean(onOpenTrackArtist && trackArtist);
  const canOpenTrackAlbum = Boolean(onOpenTrackAlbum && displayAlbumWithYear);

  const hasPlayablePlaylists = playlists.length > 0;
  const effectiveQueue = queueTracks.length > 0 ? queueTracks : [track];
  const queueCurrentId = currentQueueTrackId ?? track.id;
  const rawQueueCurrentIndex = effectiveQueue.findIndex((queueTrack) => queueTrack.id === queueCurrentId);
  const queueCurrentIndex = rawQueueCurrentIndex >= 0 ? rawQueueCurrentIndex : 0;

  return (
    <section className={sectionClassName}>
      <audio
        ref={audioRef}
        src={streamSource}
        preload="metadata"
        onPlay={handleAudioPlay}
        onPause={handleAudioPause}
        onEnded={onEnded}
        onTimeUpdate={handleAudioTimeUpdate}
        onLoadedMetadata={handleAudioLoadedMetadata}
      />

      <div
        className={`flex min-w-0 ${
          expanded ? "min-h-0 flex-1 flex-col items-center justify-center gap-4" : "flex-row items-center gap-3"
        }`}
      >
        {expanded ? (
          <div className="relative shrink-0 overflow-hidden rounded-2xl">
            {isRadioMode && !isRadioStopped ? (
              <div className="absolute left-4 top-4 z-30 rounded-md border border-[rgba(255,255,255,0.5)] bg-[#ffffff] p-1 shadow-sm">
                <img className="h-10 w-10" src="/radio.png" alt="Radio mode" />
              </div>
            ) : null}
            {hasLyrics && !isRadioStopped ? (
              <button
                className="absolute inset-0 z-10 cursor-pointer"
                type="button"
                onClick={() => setShowLyricsOverlay((current) => !current)}
                aria-pressed={showLyricsOverlay}
                aria-label={showLyricsOverlay ? "Hide lyrics" : "Show lyrics"}
              />
            ) : null}
            {isRadioStopped ? (
              <div className={`${artworkClassName} border border-[rgba(255,255,255,0.5)] bg-[#ffffff] flex items-center justify-center`}>
                <img className="h-30 w-30" src="/radio.png" alt="Radio" />
              </div>
            ) : (
              <img
                className={artworkClassName}
                src={coverUrl(track.id, track.cover)}
                alt={displayAlbumWithYear ? `Cover for ${displayAlbumWithYear}` : "Track cover"}
                onError={(event) => {
                  event.currentTarget.src = defaultCoverImage;
                }}
              />
            )}

            {showLyricsOverlay && displayLyrics && !isRadioStopped ? (
              <div className="absolute inset-0 z-20 overflow-hidden bg-black/80 p-5">
                <button
                  className="absolute right-2 top-2 z-30 flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                  type="button"
                  onClick={() => setShowLyricsOverlay(false)}
                  aria-label="Close lyrics"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
                {syncedLyrics ? (
                  <SyncedLyricsOverlay lines={syncedLyrics} currentTime={currentTime} />
                ) : (
                  <div className="h-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap text-left text-sm leading-relaxed text-[#ffffff]">
                    {displayLyrics}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="relative shrink-0">
            {isRadioMode && !isRadioStopped ? (
              <div className="absolute left-2 top-2 z-20 rounded-md border border-[rgba(255,255,255,0.5)] bg-[#ffffff] p-1 shadow-sm">
                <img className="h-3.5 w-3.5" src="/radio.png" alt="Radio mode" />
              </div>
            ) : null}
            {isRadioStopped ? (
              <div className={`${artworkClassName} flex items-center justify-center border border-[rgba(255,255,255,0.5)] bg-[#ffffff]`}>
                <img className="h-10 w-10" src="/radio.png" alt="Radio" />
              </div>
            ) : onArtworkClick ? (
              <button
                className="shrink-0 rounded-2xl"
                type="button"
                aria-label="Open player view"
                onClick={onArtworkClick}
              >
                <img
                  className={`${artworkClassName} cursor-pointer`}
                  src={coverUrl(track.id, track.cover)}
                  alt={displayAlbumWithYear ? `Cover for ${displayAlbumWithYear}` : "Track cover"}
                  onError={(event) => {
                    event.currentTarget.src = defaultCoverImage;
                  }}
                />
              </button>
            ) : (
              <img
                className={artworkClassName}
                src={coverUrl(track.id, track.cover)}
                alt={displayAlbumWithYear ? `Cover for ${displayAlbumWithYear}` : "Track cover"}
                onError={(event) => {
                  event.currentTarget.src = defaultCoverImage;
                }}
              />
            )}
          </div>
        )}

        <div className={contentLayoutClass}>
          <div className={textBlockClassName}>
            {isRadioStopped ? (
              <p className={`font-display text-flaque-ink leading-tight ${expanded ? "text-2xl" : "text-lg"}`}>
                Radio stopped
              </p>
            ) : (
              <>
                {expanded ? (
                  <p
                    className="font-display text-flaque-ink leading-tight text-2xl truncate"
                    title={displayTitle}
                  >
                    {displayTitle}
                  </p>
                ) : (
                  <div className="flex min-w-0 items-center gap-2">
                    <p
                      className="min-w-0 truncate font-display text-flaque-ink leading-tight text-lg"
                      title={displayTitle}
                    >
                      {displayTitle}
                    </p>
                    {hasLyrics ? (
                      <span className="shrink-0 rounded bg-flaque-ink/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-flaque-ink/70 dark:bg-flaque-cream/10 dark:text-flaque-cream/70">
                        L<span className="hidden sm:inline">yrics</span>
                      </span>
                    ) : null}
                  </div>
                )}
                {expanded ? (
                  <>
                    <p className={secondaryTextClassName}>
                      {canOpenTrackArtist ? (
                        <button
                          className="max-w-full truncate rounded-sm text-left underline-offset-2 transition hover:text-flaque-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand/70"
                          type="button"
                          title={`Open artist: ${displayArtist}`}
                          onClick={onOpenTrackArtist}
                        >
                          {displayArtist}
                        </button>
                      ) : (
                        displayArtist
                      )}
                    </p>
                    {displayAlbumWithYear ? (
                      <p className="truncate text-xs text-flaque-steel/80">
                        {canOpenTrackAlbum ? (
                          <button
                            className="max-w-full truncate rounded-sm text-left underline-offset-2 transition hover:text-flaque-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand/70"
                            type="button"
                            title={`Open album: ${displayAlbumWithYear}`}
                            onClick={onOpenTrackAlbum}
                          >
                            {displayAlbumWithYear}
                          </button>
                        ) : (
                          displayAlbumWithYear
                        )}
                      </p>
                    ) : null}
                    <p className={metaTextClassName}>
                      {codecLabel}
                      {hasLyrics ? (
                        <span className="ml-2 rounded bg-flaque-ink/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-flaque-ink/70 dark:bg-flaque-cream/10 dark:text-flaque-cream/70">
                          Lyrics
                        </span>
                      ) : null}
                    </p>
                  </>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <p className="min-w-0 flex-1 overflow-x-auto scrollbar-hide whitespace-nowrap font-body text-xs text-flaque-steel">
                      {canOpenTrackArtist ? (
                        <button
                          className="rounded-sm text-left underline-offset-2 transition hover:text-flaque-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand/70"
                          type="button"
                          title={`Open artist: ${displayArtist}`}
                          onClick={onOpenTrackArtist}
                        >
                          {displayArtist}
                        </button>
                      ) : (
                        displayArtist
                      )}
                      {displayAlbumWithYear ? (
                        <>
                          {" - "}
                          {canOpenTrackAlbum ? (
                            <button
                              className="rounded-sm text-left underline-offset-2 transition hover:text-flaque-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand/70"
                              type="button"
                              title={`Open album: ${displayAlbumWithYear}`}
                              onClick={onOpenTrackAlbum}
                            >
                              {displayAlbumWithYear}
                            </button>
                          ) : (
                            displayAlbumWithYear
                          )}
                        </>
                      ) : null}
                    </p>
                    <p className={`${metaTextClassName} shrink-0 whitespace-nowrap`}>{codecLabel}</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={controlsLayoutClass}>
            <div className={primaryControlsClassName}>
            {isRadioMode ? null : (
              <button
                className={ghostControlButtonClassName}
                type="button"
                aria-label="Previous track"
                title="Previous"
                onClick={() => {
                  if (onPrevious) {
                    void onPrevious({ wrap: false });
                  }
                }}
                disabled={!onPrevious || seekLocked}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 6h2v12H7zM19 6v12l-8.5-6L19 6z" />
                </svg>
              </button>
            )}
            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-flaque-ink text-flaque-cream transition hover:bg-flaque-steel"
              type="button"
              aria-label={isRadioMode && isPlaying ? "Stop radio" : isPlaying ? "Pause playback" : "Play playback"}
              title={isRadioMode && isPlaying ? "Stop" : isPlaying ? "Pause" : "Play"}
              onClick={() => {
                if (isRadioMode && isPlaying) {
                  pausePlayback();
                  onStopRadioPlayback?.();
                  return;
                }

                if (isRadioMode && !isPlaying) {
                  if (onResumeRadioPlayback) {
                    void onResumeRadioPlayback();
                    return;
                  }
                }

                onTogglePlayback();
              }}
            >
              {isRadioMode && isPlaying ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 7h10v10H7z" />
                </svg>
              ) : isPlaying ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 6h3v12H8zM13 6h3v12h-3z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 6v12l10-6-10-6z" />
                </svg>
              )}
            </button>
            {isRadioMode ? null : (
              <button
                className={ghostControlButtonClassName}
                type="button"
                aria-label="Next track"
                title="Next"
                onClick={() => {
                  if (onNext) {
                    void onNext({ wrap: false });
                  }
                }}
                disabled={!onNext || seekLocked}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M15 6h2v12h-2zM5 6v12l8.5-6L5 6z" />
                </svg>
              </button>
            )}

            </div>

            <div className={centerControlsClassName}>
              <div className="flex justify-center gap-1.5">
              {isRadioMode ? null : (
                <button
                  className={`hidden h-9 w-9 items-center justify-center rounded-xl transition lg:flex ${
                    repeatMode === "off"
                      ? "bg-flaque-cream/80 text-flaque-ink hover:bg-flaque-sand"
                      : "bg-flaque-ink text-flaque-cream hover:bg-flaque-steel"
                  }`}
                  type="button"
                  aria-label={
                    repeatMode === "off"
                      ? "Enable repeat all"
                      : repeatMode === "all"
                        ? "Enable repeat one"
                        : "Disable repeat"
                  }
                  title={
                    repeatMode === "off"
                      ? "Repeat off"
                      : repeatMode === "all"
                        ? "Repeat all"
                        : "Repeat one"
                  }
                  onClick={onCycleRepeatMode}
                >
                  {repeatMode === "one" ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M17 2l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3 11V9a4 4 0 014-4h13" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M7 22l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M21 13v2a4 4 0 01-4 4H4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M12 9v6" strokeLinecap="round" />
                      <path d="M10.5 10.5L12 9l1.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M17 2l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3 11V9a4 4 0 014-4h13" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M7 22l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M21 13v2a4 4 0 01-4 4H4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )}

              {isRadioMode ? null : (
                <button
                  className={`hidden h-9 w-9 items-center justify-center rounded-xl transition lg:flex ${
                    shuffleEnabled
                      ? "bg-flaque-ink text-flaque-cream hover:bg-flaque-steel"
                      : "bg-flaque-cream/80 text-flaque-ink hover:bg-flaque-sand"
                  }`}
                  type="button"
                  aria-label={shuffleEnabled ? "Disable shuffle" : "Enable shuffle"}
                  title={shuffleEnabled ? "Shuffle on" : "Shuffle off"}
                  onClick={onToggleShuffle}
                  disabled={!onShuffleEnabledChange}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M16 3h5v5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 20l8-8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M21 3l-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 4l6 6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M15 16l2 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              </div>


            </div>

            <div className={trailingControlsClassName}>
              <button
                className={queueButtonClassName}
                type="button"
                aria-label={showQueuePanel ? "Hide queue" : "Show queue"}
                title={showQueuePanel ? "Hide queue" : "Show queue"}
                disabled={seekLocked}
                onClick={() => setShowQueuePanel((current) => !current)}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <button
                className={playlistButtonClassName}
                type="button"
                aria-label="Add to playlist"
                title="Add to playlist"
                onClick={() => setShowPlaylistPicker((current) => !current)}
                disabled={!onAddTrackToPlaylist || !hasPlayablePlaylists}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <button
                className={`${ghostControlButtonClassName} lg:hidden`}
                type="button"
                aria-label={showMobileUtilityPanel ? "Close player options" : "Open player options"}
                title={showMobileUtilityPanel ? "Close options" : "More options"}
                aria-expanded={showMobileUtilityPanel}
                onClick={() => setShowMobileUtilityPanel((current) => !current)}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M5 12h.01M12 12h.01M19 12h.01" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <div className="hidden h-9 items-center justify-end gap-2 lg:flex">
                <label className="sr-only" htmlFor="player-quality-select-desktop">
                  Quality
                </label>
                <select
                  id="player-quality-select-desktop"
                  className={`${qualitySelectClassName} w-28`}
                  value={transcodeMode}
                  onChange={(event) => handleTranscodeModeChange(event.target.value as TranscodeMode)}
                >
                  <option value="original">Original</option>
                  <option value="opus">Opus fallback</option>
                  <option value="mp3">MP3 fallback</option>
                </select>

                <button
                  className={ghostControlButtonClassName}
                  type="button"
                  aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
                  title={muted || volume === 0 ? "Unmute" : "Mute"}
                  onClick={() => setMuted((current) => !current)}
                >
                  {muted || volume === 0 ? (
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M3 10v4h4l5 4V6L7 10H3z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M16 9l5 6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M21 9l-5 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M3 10v4h4l5 4V6L7 10H3z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M16 9a5 5 0 010 6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M19 7a8 8 0 010 10" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                <input
                  className="h-2 w-28 cursor-pointer appearance-none rounded-full bg-flaque-clay/60"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  aria-label="Volume"
                  title="Volume"
                  onChange={(event) => handleVolumeChange(Number(event.target.value))}
                />
              </div>
            </div>
          </div>

          {showPlaylistPicker && onAddTrackToPlaylist ? (
            <PlaylistPicker
              trackId={track.id}
              playlists={playlists}
              onAddTrackToPlaylist={onAddTrackToPlaylist}
              onDismiss={() => setShowPlaylistPicker(false)}
            />
          ) : null}

          {showMobileUtilityPanel ? (
            <div className="space-y-3 rounded-xl border border-flaque-clay/60 bg-flaque-cream/45 p-3 lg:hidden">
              <div className="flex items-center justify-end">
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-flaque-clay bg-white text-flaque-ink transition hover:bg-flaque-sand"
                  type="button"
                  aria-label="Close player options"
                  title="Close"
                  onClick={() => setShowMobileUtilityPanel(false)}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M6 6l12 12" strokeLinecap="round" />
                    <path d="M18 6l-12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`flex h-9 items-center justify-center rounded-xl transition ${
                    repeatMode === "off"
                      ? "bg-flaque-cream/80 text-flaque-ink hover:bg-flaque-sand"
                      : "bg-flaque-ink text-flaque-cream hover:bg-flaque-steel"
                  }`}
                  type="button"
                  aria-label={
                    repeatMode === "off"
                      ? "Enable repeat all"
                      : repeatMode === "all"
                        ? "Enable repeat one"
                        : "Disable repeat"
                  }
                  title={
                    repeatMode === "off"
                      ? "Repeat off"
                      : repeatMode === "all"
                        ? "Repeat all"
                        : "Repeat one"
                  }
                  onClick={onCycleRepeatMode}
                >
                  {repeatMode === "one" ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M17 2l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3 11V9a4 4 0 014-4h13" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M7 22l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M21 13v2a4 4 0 01-4 4H4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M12 9v6" strokeLinecap="round" />
                      <path d="M10.5 10.5L12 9l1.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M17 2l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M3 11V9a4 4 0 014-4h13" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M7 22l-3-3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M21 13v2a4 4 0 01-4 4H4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                <button
                  className={`flex h-9 items-center justify-center rounded-xl transition ${
                    shuffleEnabled
                      ? "bg-flaque-ink text-flaque-cream hover:bg-flaque-steel"
                      : "bg-flaque-cream/80 text-flaque-ink hover:bg-flaque-sand"
                  }`}
                  type="button"
                  aria-label={shuffleEnabled ? "Disable shuffle" : "Enable shuffle"}
                  title={shuffleEnabled ? "Shuffle on" : "Shuffle off"}
                  onClick={onToggleShuffle}
                  disabled={!onShuffleEnabledChange}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M16 3h5v5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 20l8-8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M21 3l-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 4l6 6" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M15 16l2 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              <label className="flex items-center justify-between gap-2 text-xs text-flaque-steel" htmlFor="player-quality-select-mobile">
                <span>Quality</span>
                <select
                  id="player-quality-select-mobile"
                  className={`${qualitySelectClassName} w-32`}
                  value={transcodeMode}
                  onChange={(event) => handleTranscodeModeChange(event.target.value as TranscodeMode)}
                >
                  <option value="original">Original</option>
                  <option value="opus">Opus fallback</option>
                  <option value="mp3">MP3 fallback</option>
                </select>
              </label>

              <div className="flex items-center gap-2">
                <button
                  className={ghostControlButtonClassName}
                  type="button"
                  aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
                  title={muted || volume === 0 ? "Unmute" : "Mute"}
                  onClick={() => setMuted((current) => !current)}
                >
                  {muted || volume === 0 ? (
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M3 10v4h4l5 4V6L7 10H3z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M16 9l5 6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M21 9l-5 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <path d="M3 10v4h4l5 4V6L7 10H3z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M16 9a5 5 0 010 6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M19 7a8 8 0 010 10" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                <input
                  className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-flaque-clay/60"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  aria-label="Volume"
                  title="Volume"
                  onChange={(event) => handleVolumeChange(Number(event.target.value))}
                />
              </div>
            </div>
          ) : null}

          {transcodeMode !== "original" ? (
            <p className="text-xs text-flaque-steel">
              {canTranscode
                ? `Streaming fallback via ${transcodeMode.toUpperCase()}.`
                : "Fallback transcoding is available only for FLAC tracks. Streaming original source."}
            </p>
          ) : null}

          {expanded ? (
            <>
              <input
                className={`h-2 w-full appearance-none rounded-full bg-flaque-clay/60 ${seekLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                type="range"
                min={0}
                max={Math.max(duration || track.duration, 1)}
                step={0.1}
                value={Math.min(currentTime, duration || track.duration || 0)}
                disabled={seekLocked}
                onChange={(event) => onSeek(Number(event.target.value))}
              />
              <div className="flex w-full justify-between text-xs text-flaque-steel">
                <span>{formatDuration(currentTime)}</span>
                <span>{formatDuration(duration || track.duration)}</span>
              </div>
            </>
          ) : (
            <div className="-ml-[calc(4rem+0.75rem)] flex items-center gap-3 md:-ml-[calc(5rem+0.75rem)]">
              <span className="w-16 shrink-0 whitespace-nowrap text-center text-[10px] text-flaque-steel md:w-20">
                {formatDuration(currentTime)} / {formatDuration(duration || track.duration)}
              </span>
              <input
                className={`h-2 flex-1 appearance-none rounded-full bg-flaque-clay/60 ${seekLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                type="range"
                min={0}
                max={Math.max(duration || track.duration, 1)}
                step={0.1}
                value={Math.min(currentTime, duration || track.duration || 0)}
                disabled={seekLocked}
                onChange={(event) => onSeek(Number(event.target.value))}
              />
            </div>
          )}

          {showQueuePanel ? (
            <QueuePanel
              tracks={effectiveQueue}
              currentIndex={queueCurrentIndex}
              expanded={expanded}
              onTrackSelect={onQueueTrackSelect}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
