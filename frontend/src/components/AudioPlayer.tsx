import { useEffect, useMemo, useRef, useState } from "react";

import { coverUrl, streamUrl } from "../api";
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
      const snapshotTime = audioElement.currentTime > 0 ? audioElement.currentTime : currentTimeRef.current;
      pendingRestoreTimeRef.current = snapshotTime;
      pendingRestoreShouldPlayRef.current = !audioElement.paused;
      currentTimeRef.current = snapshotTime;
      setCurrentTime(snapshotTime);
      setIsPlaying(!audioElement.paused);
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

  const artworkSize = expanded ? "h-52 w-52" : "h-20 w-20";

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

      <div className={`flex ${expanded ? "flex-col items-center gap-6" : "flex-col gap-4 md:flex-row md:items-center"}`}>
        <img
          className={`${artworkSize} rounded-2xl border border-flaque-clay/50 object-cover`}
          src={coverUrl(track.id, track.cover)}
          alt={track.tags.album ? `Cover for ${track.tags.album}` : "Track cover"}
          onError={(event) => {
            event.currentTarget.src =
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320'%3E%3Crect width='100%25' height='100%25' fill='%23d9b88a'/%3E%3Ctext x='50%25' y='52%25' text-anchor='middle' fill='%232c1f1a' font-size='24' font-family='sans-serif'%3ENo Cover%3C/text%3E%3C/svg%3E";
          }}
        />

        <div className="w-full space-y-3">
          <div>
            <p className="font-display text-xl text-flaque-ink truncate" title={track.tags.title ?? track.path}>
              {track.tags.title ?? track.path}
            </p>
            <p className="text-sm text-flaque-steel">{track.tags.artist ?? "Unknown artist"}</p>
            <p className="text-xs uppercase tracking-[0.2em] text-flaque-steel/80">
              {track.codec} {track.sampleRate ? `- ${Math.round(track.sampleRate / 1000)} kHz` : ""}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                if (onPrevious) {
                  void onPrevious();
                }
              }}
              disabled={!onPrevious}
            >
              Prev
            </button>
            <button
              className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black"
              type="button"
              onClick={onTogglePlayback}
            >
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                if (onNext) {
                  void onNext();
                }
              }}
              disabled={!onNext}
            >
              Next
            </button>
            <span className="text-xs text-flaque-steel">
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
                  onTranscodeModeChange(event.target.value as TranscodeMode);
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
