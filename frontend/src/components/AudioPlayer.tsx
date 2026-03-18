import { useEffect, useMemo, useRef, useState } from "react";

import { coverUrl, streamUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { Track } from "../types";

export type TranscodeMode = "original" | "opus" | "mp3";

type AudioPlayerProps = {
  track: Track | null;
  expanded?: boolean;
  onPrevious?: () => Promise<void> | void;
  onNext?: () => Promise<void> | void;
  onTrackPlayed?: (track: Track) => void;
  transcodeMode?: TranscodeMode;
  onTranscodeModeChange?: (mode: TranscodeMode) => void;
  playRequestNonce?: number;
};

function isFlacTrack(track: Track): boolean {
  return (
    track.mimeType.toLowerCase() === "audio/flac" ||
    track.codec.toLowerCase() === "flac" ||
    track.path.toLowerCase().endsWith(".flac")
  );
}

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "0:00";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function AudioPlayer({
  track,
  expanded = false,
  onPrevious,
  onNext,
  onTrackPlayed,
  transcodeMode = "original",
  onTranscodeModeChange,
  playRequestNonce = 0
}: AudioPlayerProps): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoplayOnTrackChangeRef = useRef(true);
  const lastPlayRequestHandledRef = useRef(0);
  const lastTrackIdRef = useRef<string | null>(null);
  const lastStreamSourceRef = useRef("");
  const pendingRestoreTimeRef = useRef<number | null>(null);
  const pendingRestoreShouldPlayRef = useRef(false);
  const qualitySwapSnapshotTimeRef = useRef<number | null>(null);
  const qualitySwapShouldPlayRef = useRef<boolean | null>(null);
  const currentTimeRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const canTranscode = Boolean(track && isFlacTrack(track));
  const requestedTranscode = transcodeMode === "original" ? undefined : transcodeMode;
  const effectiveTranscode = canTranscode ? requestedTranscode : undefined;

  const streamSource = useMemo(() => {
    if (!track) {
      return "";
    }
    return streamUrl(track.id, effectiveTranscode ? { transcode: effectiveTranscode } : undefined);
  }, [track?.id, effectiveTranscode]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || !track) {
      return;
    }

    pendingRestoreTimeRef.current = null;
    pendingRestoreShouldPlayRef.current = false;
    qualitySwapSnapshotTimeRef.current = null;
    qualitySwapShouldPlayRef.current = null;
    currentTimeRef.current = 0;
    setCurrentTime(0);
    setDuration(track.duration || 0);
    audioElement.load();

    if (!autoplayOnTrackChangeRef.current) {
      setIsPlaying(false);
      return;
    }

    audioElement
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch(() => {
        setIsPlaying(false);
      });
  }, [track?.id]);

  useEffect(() => {
    const audioElement = audioRef.current;

    if (!track || !audioElement) {
      lastTrackIdRef.current = track?.id ?? null;
      lastStreamSourceRef.current = streamSource;
      return;
    }

    const previousTrackId = lastTrackIdRef.current;
    const previousSource = lastStreamSourceRef.current;
    const sameTrack = previousTrackId === track.id;
    const sourceChanged = Boolean(previousSource) && previousSource !== streamSource;

    if (sameTrack && sourceChanged) {
      const snapshotTime =
        qualitySwapSnapshotTimeRef.current ??
        (audioElement.currentTime > 0 ? audioElement.currentTime : currentTimeRef.current);
      const shouldResumePlayback = qualitySwapShouldPlayRef.current ?? !audioElement.paused;

      pendingRestoreTimeRef.current = snapshotTime;
      pendingRestoreShouldPlayRef.current = shouldResumePlayback;

      currentTimeRef.current = snapshotTime;
      setCurrentTime(snapshotTime);
      setIsPlaying(shouldResumePlayback);

      qualitySwapSnapshotTimeRef.current = null;
      qualitySwapShouldPlayRef.current = null;

      audioElement.load();
    }

    lastTrackIdRef.current = track.id;
    lastStreamSourceRef.current = streamSource;
  }, [streamSource, track?.id]);

  useEffect(() => {
    if (!track || !audioRef.current) {
      return;
    }

    if (!playRequestNonce || playRequestNonce === lastPlayRequestHandledRef.current) {
      return;
    }

    lastPlayRequestHandledRef.current = playRequestNonce;
    autoplayOnTrackChangeRef.current = true;

    audioRef.current.currentTime = 0;
    audioRef.current
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch(() => {
        setIsPlaying(false);
      });
  }, [playRequestNonce, track?.id]);

  function onTogglePlayback(): void {
    const audioElement = audioRef.current;
    if (!audioElement || !track) {
      return;
    }

    if (audioElement.paused) {
      autoplayOnTrackChangeRef.current = true;
      audioElement
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
      return;
    }

    autoplayOnTrackChangeRef.current = false;
    audioElement.pause();
    setIsPlaying(false);
  }

  function onSeek(nextSeconds: number): void {
    const audioElement = audioRef.current;
    if (!audioElement || !track) {
      return;
    }

    audioElement.currentTime = nextSeconds;
    currentTimeRef.current = nextSeconds;
    setCurrentTime(nextSeconds);
  }

  function onEnded(): void {
    setIsPlaying(false);
    if (onNext && autoplayOnTrackChangeRef.current) {
      void onNext();
    }
  }

  if (!track) {
    return (
      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-6 shadow-panel backdrop-blur-sm">
        <h2 className="font-display text-xl text-flaque-ink">Player</h2>
        <p className="mt-2 text-sm text-flaque-steel">Select a track from the library to start streaming.</p>
      </section>
    );
  }

  const artworkSize = expanded ? "h-52 w-52" : "h-16 w-16 md:h-20 md:w-20";
  const contentLayoutClass = expanded ? "w-full space-y-3" : "min-w-0 flex-1 space-y-3";
  const controlsLayoutClass = expanded ? "flex items-center gap-3" : "flex flex-wrap items-center gap-2";

  return (
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/90 p-4 shadow-panel backdrop-blur-sm md:p-6">
      <audio
        ref={audioRef}
        src={streamSource}
        preload="metadata"
        onPlay={() => {
          setIsPlaying(true);
          if (track && onTrackPlayed) {
            onTrackPlayed(track);
          }
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={onEnded}
        onTimeUpdate={(event) => {
          const nextTime = event.currentTarget.currentTime;
          currentTimeRef.current = nextTime;
          setCurrentTime(nextTime);
        }}
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration || track.duration || 0;
          setDuration(nextDuration);

          const pendingTime = pendingRestoreTimeRef.current;
          if (pendingTime === null) {
            return;
          }

          const maxSeek = Math.max(0, nextDuration - 0.25);
          const restoreTime = Math.min(Math.max(0, pendingTime), maxSeek || pendingTime);
          event.currentTarget.currentTime = restoreTime;
          currentTimeRef.current = restoreTime;
          setCurrentTime(restoreTime);
          pendingRestoreTimeRef.current = null;

          const shouldResumePlayback = pendingRestoreShouldPlayRef.current;
          pendingRestoreShouldPlayRef.current = false;

          if (!shouldResumePlayback) {
            setIsPlaying(false);
            return;
          }

          event.currentTarget
            .play()
            .then(() => {
              setIsPlaying(true);
            })
            .catch(() => {
              setIsPlaying(false);
            });
        }}
      />

      <div className={`flex min-w-0 ${expanded ? "flex-col items-center gap-6" : "flex-col gap-4 md:flex-row md:items-center"}`}>
        <img
          className={`${artworkSize} shrink-0 rounded-2xl border border-flaque-clay/50 object-cover`}
          src={coverUrl(track.id, track.cover)}
          alt={track.tags.album ? `Cover for ${track.tags.album}` : "Track cover"}
          onError={(event) => {
            event.currentTarget.src = defaultCoverImage;
          }}
        />

        <div className={contentLayoutClass}>
          <div>
            <p
              className={`font-display text-flaque-ink truncate ${expanded ? "text-xl" : "text-lg"}`}
              title={track.tags.title ?? track.path}
            >
              {track.tags.title ?? track.path}
            </p>
            <p className="truncate text-sm text-flaque-steel">{track.tags.artist ?? "Unknown artist"}</p>
            <p className="text-xs uppercase tracking-[0.2em] text-flaque-steel/80">
              {track.codec} {track.sampleRate ? `- ${Math.round(track.sampleRate / 1000)} kHz` : ""}
            </p>
          </div>

          <div className={controlsLayoutClass}>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-flaque-clay bg-white text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              aria-label="Previous track"
              title="Previous"
              onClick={() => {
                if (onPrevious) {
                  void onPrevious();
                }
              }}
              disabled={!onPrevious}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M7 6h2v12H7zM19 6v12l-8.5-6L19 6z" />
              </svg>
            </button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-flaque-ink text-flaque-cream transition hover:bg-black"
              type="button"
              aria-label={isPlaying ? "Pause playback" : "Play playback"}
              title={isPlaying ? "Pause" : "Play"}
              onClick={onTogglePlayback}
            >
              {isPlaying ? (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 6h3v12H8zM13 6h3v12h-3z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 6v12l10-6-10-6z" />
                </svg>
              )}
            </button>
            <button
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-flaque-clay bg-white text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              aria-label="Next track"
              title="Next"
              onClick={() => {
                if (onNext) {
                  void onNext();
                }
              }}
              disabled={!onNext}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M15 6h2v12h-2zM5 6v12l8.5-6L5 6z" />
              </svg>
            </button>
            <span className="whitespace-nowrap text-xs text-flaque-steel">
              {formatDuration(currentTime)} / {formatDuration(duration || track.duration)}
            </span>

            <label className="flex items-center gap-2 text-xs text-flaque-steel">
              <span>Quality</span>
              <select
                className="rounded-lg border border-flaque-clay bg-white px-2 py-1 text-xs text-flaque-ink"
                value={transcodeMode}
                onChange={(event) => {
                  if (!onTranscodeModeChange) {
                    return;
                  }

                  const nextMode = event.target.value as TranscodeMode;
                  if (nextMode === transcodeMode) {
                    return;
                  }

                  const nextRequestedTranscode = nextMode === "original" ? undefined : nextMode;
                  const nextEffectiveTranscode = canTranscode ? nextRequestedTranscode : undefined;
                  const sourceWillChange = nextEffectiveTranscode !== effectiveTranscode;

                  if (sourceWillChange) {
                    const audioElement = audioRef.current;
                    const snapshotTime = audioElement && audioElement.currentTime > 0 ? audioElement.currentTime : currentTimeRef.current;
                    const shouldResumePlayback = audioElement ? !audioElement.paused : isPlaying;

                    qualitySwapSnapshotTimeRef.current = snapshotTime;
                    qualitySwapShouldPlayRef.current = shouldResumePlayback;
                  } else {
                    qualitySwapSnapshotTimeRef.current = null;
                    qualitySwapShouldPlayRef.current = null;
                  }

                  onTranscodeModeChange(nextMode);
                }}
              >
                <option value="original">Original</option>
                <option value="opus">Opus fallback</option>
                <option value="mp3">MP3 fallback</option>
              </select>
            </label>
          </div>

          {transcodeMode !== "original" ? (
            <p className="text-xs text-flaque-steel">
              {canTranscode
                ? `Streaming fallback via ${transcodeMode.toUpperCase()}.`
                : "Fallback transcoding is available only for FLAC tracks. Streaming original source."}
            </p>
          ) : null}

          <input
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-flaque-clay/60"
            type="range"
            min={0}
            max={Math.max(duration || track.duration, 1)}
            step={0.1}
            value={Math.min(currentTime, duration || track.duration || 0)}
            onChange={(event) => onSeek(Number(event.target.value))}
          />
        </div>
      </div>
    </section>
  );
}
