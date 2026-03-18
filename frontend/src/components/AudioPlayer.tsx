import { useEffect, useMemo, useRef, useState } from "react";

import { coverUrl, streamUrl } from "../api";
import type { Track } from "../types";

type AudioPlayerProps = {
  track: Track | null;
  expanded?: boolean;
  onPrevious?: () => Promise<void> | void;
  onNext?: () => Promise<void> | void;
};

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
  onNext
}: AudioPlayerProps): JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const streamSource = useMemo(() => {
    if (!track) {
      return "";
    }
    return streamUrl(track.id);
  }, [track]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement || !track) {
      return;
    }

    setCurrentTime(0);
    setDuration(track.duration || 0);
    audioElement.load();

    audioElement
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch(() => {
        setIsPlaying(false);
      });
  }, [track?.id]);

  function onTogglePlayback(): void {
    const audioElement = audioRef.current;
    if (!audioElement || !track) {
      return;
    }

    if (audioElement.paused) {
      audioElement
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
      return;
    }

    audioElement.pause();
    setIsPlaying(false);
  }

  function onSeek(nextSeconds: number): void {
    const audioElement = audioRef.current;
    if (!audioElement || !track) {
      return;
    }

    audioElement.currentTime = nextSeconds;
    setCurrentTime(nextSeconds);
  }

  function onEnded(): void {
    setIsPlaying(false);
    if (onNext) {
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
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={onEnded}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || track.duration || 0)}
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
            <p className="font-display text-xl text-flaque-ink">{track.tags.title ?? track.path}</p>
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
          </div>

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
