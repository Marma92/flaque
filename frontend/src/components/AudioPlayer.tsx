import { useEffect, useMemo, useState } from "react";

import { useAudioPlayback, type RepeatMode, type TranscodeMode } from "../hooks/useAudioPlayback";
import { usePlaybackPositionPersistence } from "../hooks/usePlaybackPositionPersistence";
import type { Playlist, Track } from "../types";
import { formatDuration } from "../utils/format";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayLyrics,
  getTrackDisplayTitle,
  getTrackSyncedLyrics
} from "../utils/tracks";
import { PlayerArtwork } from "./audioPlayer/PlayerArtwork";
import { PlayerEmpty } from "./audioPlayer/PlayerEmpty";
import { PlayerMobileOptionsPanel } from "./audioPlayer/PlayerMobileOptionsPanel";
import { PlayerTrackInfo } from "./audioPlayer/PlayerTrackInfo";
import {
  AddIcon,
  MoreIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  QueueIcon,
  RepeatAllIcon,
  RepeatOneIcon,
  ShuffleIcon,
  StopIcon,
  VolumeMutedIcon,
  VolumeOnIcon
} from "./audioPlayer/icons";
import { PlaylistPicker } from "./PlaylistPicker";
import { QueuePanel } from "./QueuePanel";

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

const repeatLabels = {
  off: { aria: "Enable repeat all", title: "Repeat off" },
  all: { aria: "Enable repeat one", title: "Repeat all" },
  one: { aria: "Disable repeat", title: "Repeat one" }
} satisfies Record<RepeatMode, { aria: string; title: string }>;

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
    pausePlayback, onTogglePlayback, onSeek, handlePrevious, onEnded,
    onCycleRepeatMode, onToggleShuffle,
    handleTranscodeModeChange, handleVolumeChange, setMuted,
    handleAudioPlay, handleAudioPause, handleAudioTimeUpdate, handleAudioLoadedMetadata
  } = useAudioPlayback({
    track, transcodeMode, onTranscodeModeChange,
    repeatMode, onRepeatModeChange,
    shuffleEnabled, onShuffleEnabledChange,
    playRequestNonce, playRequestOffsetSec, onNext, onPrevious, onTrackPlayed, onTrackSkipped
  });

  usePlaybackPositionPersistence({ track, currentTime, isPlaying, queue: queueTracks });

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

  // `effectiveTranscode` is computed by the hook even when no track is loaded;
  // referencing it in the empty-state branch keeps dead-code paths quiet.
  void effectiveTranscode;

  const syncedLyrics = useMemo(() => (track ? getTrackSyncedLyrics(track) : null), [track]);

  if (!track) {
    return <PlayerEmpty expanded={expanded} onNavigateToLibrary={onNavigateToLibrary} />;
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

  const repeatLabel = repeatLabels[repeatMode];
  const isVolumeMuted = muted || volume === 0;
  const handleToggleMuted = () => setMuted((current) => !current);

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
        <PlayerArtwork
          track={track}
          expanded={expanded}
          artworkClassName={artworkClassName}
          isRadioMode={isRadioMode}
          isRadioStopped={isRadioStopped}
          hasLyrics={hasLyrics}
          displayLyrics={displayLyrics}
          syncedLyrics={syncedLyrics}
          displayAlbumWithYear={displayAlbumWithYear}
          showLyricsOverlay={showLyricsOverlay}
          onToggleLyricsOverlay={() => setShowLyricsOverlay((current) => !current)}
          onCloseLyricsOverlay={() => setShowLyricsOverlay(false)}
          currentTime={currentTime}
          onArtworkClick={onArtworkClick}
        />

        <div className={contentLayoutClass}>
          <PlayerTrackInfo
            expanded={expanded}
            isRadioStopped={isRadioStopped}
            displayTitle={displayTitle}
            displayArtist={displayArtist}
            displayAlbumWithYear={displayAlbumWithYear}
            codecLabel={codecLabel}
            hasLyrics={hasLyrics}
            canOpenTrackArtist={canOpenTrackArtist}
            canOpenTrackAlbum={canOpenTrackAlbum}
            onOpenTrackArtist={onOpenTrackArtist}
            onOpenTrackAlbum={onOpenTrackAlbum}
          />

          <div className={controlsLayoutClass}>
            <div className={primaryControlsClassName}>
              {isRadioMode ? null : (
                <button
                  className={ghostControlButtonClassName}
                  type="button"
                  aria-label="Previous track"
                  title="Previous"
                  onClick={() => handlePrevious({ wrap: false })}
                  disabled={!onPrevious || seekLocked}
                >
                  <PrevIcon />
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
                {isRadioMode && isPlaying ? <StopIcon /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
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
                  <NextIcon />
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
                    aria-label={repeatLabel.aria}
                    title={repeatLabel.title}
                    onClick={onCycleRepeatMode}
                  >
                    {repeatMode === "one" ? <RepeatOneIcon /> : <RepeatAllIcon />}
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
                    <ShuffleIcon />
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
                <QueueIcon />
              </button>

              <button
                className={playlistButtonClassName}
                type="button"
                aria-label="Add to playlist"
                title="Add to playlist"
                onClick={() => setShowPlaylistPicker((current) => !current)}
                disabled={!onAddTrackToPlaylist || !hasPlayablePlaylists}
              >
                <AddIcon />
              </button>

              <button
                className={`${ghostControlButtonClassName} lg:hidden`}
                type="button"
                aria-label={showMobileUtilityPanel ? "Close player options" : "Open player options"}
                title={showMobileUtilityPanel ? "Close options" : "More options"}
                aria-expanded={showMobileUtilityPanel}
                onClick={() => setShowMobileUtilityPanel((current) => !current)}
              >
                <MoreIcon />
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
                  aria-label={isVolumeMuted ? "Unmute" : "Mute"}
                  title={isVolumeMuted ? "Unmute" : "Mute"}
                  onClick={handleToggleMuted}
                >
                  {isVolumeMuted ? <VolumeMutedIcon /> : <VolumeOnIcon />}
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
            <PlayerMobileOptionsPanel
              ghostControlButtonClassName={ghostControlButtonClassName}
              qualitySelectClassName={qualitySelectClassName}
              repeatMode={repeatMode}
              shuffleEnabled={shuffleEnabled}
              transcodeMode={transcodeMode}
              volume={volume}
              muted={muted}
              onClose={() => setShowMobileUtilityPanel(false)}
              onCycleRepeatMode={onCycleRepeatMode}
              onToggleShuffle={onToggleShuffle}
              onShuffleEnabledChange={onShuffleEnabledChange}
              onTranscodeModeChange={handleTranscodeModeChange}
              onVolumeChange={handleVolumeChange}
              onToggleMuted={handleToggleMuted}
            />
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
