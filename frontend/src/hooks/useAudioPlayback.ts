import { useEffect, useMemo, useRef, useState } from "react";

import { coverUrl, streamUrl } from "../api";
import type { Track } from "../types";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayTitle
} from "../utils/tracks";

export type TranscodeMode = "original" | "opus" | "mp3";
export type RepeatMode = "off" | "all" | "one";

type NavigateOptions = {
  wrap?: boolean;
};

const PLAYER_VOLUME_STORAGE_KEY = "flaque_player_volume_v1";

function isFlacTrack(track: Track): boolean {
  return (
    track.mimeType.toLowerCase() === "audio/flac" ||
    track.codec.toLowerCase() === "flac" ||
    track.path.toLowerCase().endsWith(".flac")
  );
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(1, Math.max(0, value));
}

function readStoredVolume(): number {
  if (typeof window === "undefined") {
    return 1;
  }

  const raw = Number(window.localStorage.getItem(PLAYER_VOLUME_STORAGE_KEY));
  return clampVolume(raw);
}

type UseAudioPlaybackInput = {
  track: Track | null;
  transcodeMode: TranscodeMode;
  onTranscodeModeChange?: (mode: TranscodeMode) => void;
  repeatMode: RepeatMode;
  onRepeatModeChange?: (mode: RepeatMode) => void;
  shuffleEnabled: boolean;
  onShuffleEnabledChange?: (enabled: boolean) => void;
  playRequestNonce: number;
  onNext?: (options?: NavigateOptions) => Promise<void> | void;
  onPrevious?: (options?: NavigateOptions) => Promise<void> | void;
  onTrackPlayed?: (track: Track) => void;
};

export type AudioPlaybackState = {
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
  streamSource: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  canTranscode: boolean;
  effectiveTranscode: string | undefined;
  startPlayback: () => void;
  pausePlayback: () => void;
  onTogglePlayback: () => void;
  onSeek: (seconds: number) => void;
  onEnded: () => void;
  onCycleRepeatMode: () => void;
  onToggleShuffle: () => void;
  handleTranscodeModeChange: (nextMode: TranscodeMode) => void;
  handleVolumeChange: (value: number) => void;
  setMuted: React.Dispatch<React.SetStateAction<boolean>>;
  handleAudioPlay: () => void;
  handleAudioPause: () => void;
  handleAudioTimeUpdate: (event: React.SyntheticEvent<HTMLAudioElement>) => void;
  handleAudioLoadedMetadata: (event: React.SyntheticEvent<HTMLAudioElement>) => void;
};

export function useAudioPlayback({
  track,
  transcodeMode,
  onTranscodeModeChange,
  repeatMode,
  onRepeatModeChange,
  shuffleEnabled,
  onShuffleEnabledChange,
  playRequestNonce,
  onNext,
  onPrevious,
  onTrackPlayed
}: UseAudioPlaybackInput): AudioPlaybackState {
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
  const [volume, setVolume] = useState<number>(() => readStoredVolume());
  const [muted, setMuted] = useState(false);

  const canTranscode = Boolean(track && isFlacTrack(track));
  const requestedTranscode = transcodeMode === "original" ? undefined : transcodeMode;
  const effectiveTranscode = canTranscode ? requestedTranscode : undefined;

  const streamSource = useMemo(() => {
    if (!track) {
      return "";
    }
    return streamUrl(track.id, effectiveTranscode ? { transcode: effectiveTranscode } : undefined);
  }, [track?.id, effectiveTranscode]);

  // ── Track change: reset and autoplay ──────────────────────────────────
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

  // ── Quality swap: restore position on same-track source change ────────
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

  // ── Play request nonce: force-play on external request ────────────────
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

  // ── Volume sync ───────────────────────────────────────────────────────
  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) {
      return;
    }

    audioElement.volume = volume;
    audioElement.muted = muted;
  }, [muted, track?.id, volume]);

  // ── Volume persistence ────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(PLAYER_VOLUME_STORAGE_KEY, String(volume));
  }, [volume]);

  // ── Media Session ─────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    const mediaSession = navigator.mediaSession;
    const bindAction = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        mediaSession.setActionHandler(action, handler);
      } catch {
        // ignored for unsupported actions/platforms
      }
    };

    if (!track) {
      mediaSession.metadata = null;
      mediaSession.playbackState = "none";
      bindAction("play", null);
      bindAction("pause", null);
      bindAction("previoustrack", null);
      bindAction("nexttrack", null);
      return;
    }

    const artist = getTrackDisplayArtist(track) ?? "Unknown artist";
    const album = getTrackDisplayAlbumWithYear(track) ?? "";
    if (typeof MediaMetadata !== "undefined") {
      mediaSession.metadata = new MediaMetadata({
        title: getTrackDisplayTitle(track),
        artist,
        album,
        artwork: [
          {
            src: coverUrl(track.id, track.cover),
            sizes: "512x512",
            type: "image/png"
          }
        ]
      });
    }
    mediaSession.playbackState = isPlaying ? "playing" : "paused";

    bindAction("play", () => startPlayback());
    bindAction("pause", () => pausePlayback());
    bindAction("previoustrack", () => {
      if (onPrevious) {
        void onPrevious({ wrap: false });
      }
    });
    bindAction("nexttrack", () => {
      if (onNext) {
        void onNext({ wrap: false });
      }
    });

    return () => {
      bindAction("play", null);
      bindAction("pause", null);
      bindAction("previoustrack", null);
      bindAction("nexttrack", null);
    };
  }, [isPlaying, onNext, onPrevious, track]);

  // ── Playback controls ─────────────────────────────────────────────────

  function startPlayback(): void {
    const audioElement = audioRef.current;
    if (!audioElement || !track) {
      return;
    }

    autoplayOnTrackChangeRef.current = true;
    audioElement
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }

  function pausePlayback(): void {
    const audioElement = audioRef.current;
    if (!audioElement || !track) {
      return;
    }

    autoplayOnTrackChangeRef.current = false;
    audioElement.pause();
    setIsPlaying(false);
  }

  function onTogglePlayback(): void {
    const audioElement = audioRef.current;
    if (!audioElement || !track) {
      return;
    }

    if (audioElement.paused) {
      startPlayback();
      return;
    }

    pausePlayback();
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
    const audioElement = audioRef.current;
    if (!audioElement) {
      return;
    }

    if (repeatMode === "one") {
      audioElement.currentTime = 0;
      currentTimeRef.current = 0;
      setCurrentTime(0);
      audioElement
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          setIsPlaying(false);
        });
      return;
    }

    setIsPlaying(false);
    if (onNext && autoplayOnTrackChangeRef.current) {
      void onNext({ wrap: repeatMode === "all" });
    }
  }

  function onCycleRepeatMode(): void {
    if (!onRepeatModeChange) {
      return;
    }

    const nextMode: RepeatMode =
      repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
    onRepeatModeChange(nextMode);
  }

  function onToggleShuffle(): void {
    if (!onShuffleEnabledChange) {
      return;
    }

    onShuffleEnabledChange(!shuffleEnabled);
  }

  function handleTranscodeModeChange(nextMode: TranscodeMode): void {
    if (!onTranscodeModeChange) {
      return;
    }

    if (nextMode === transcodeMode) {
      return;
    }

    const nextRequestedTranscode = nextMode === "original" ? undefined : nextMode;
    const nextEffectiveTranscode = canTranscode ? nextRequestedTranscode : undefined;
    const sourceWillChange = nextEffectiveTranscode !== effectiveTranscode;

    if (sourceWillChange) {
      const audioElement = audioRef.current;
      const snapshotTime =
        audioElement && audioElement.currentTime > 0 ? audioElement.currentTime : currentTimeRef.current;
      const shouldResumePlayback = audioElement ? !audioElement.paused : isPlaying;

      qualitySwapSnapshotTimeRef.current = snapshotTime;
      qualitySwapShouldPlayRef.current = shouldResumePlayback;
    } else {
      qualitySwapSnapshotTimeRef.current = null;
      qualitySwapShouldPlayRef.current = null;
    }

    onTranscodeModeChange(nextMode);
  }

  function handleVolumeChange(nextVolumeRaw: number): void {
    const nextVolume = clampVolume(nextVolumeRaw);
    setVolume(nextVolume);
    if (nextVolume > 0 && muted) {
      setMuted(false);
    }
  }

  // ── Audio element event handlers ──────────────────────────────────────

  function handleAudioPlay(): void {
    setIsPlaying(true);
    if (track && onTrackPlayed) {
      onTrackPlayed(track);
    }
  }

  function handleAudioPause(): void {
    setIsPlaying(false);
  }

  function handleAudioTimeUpdate(event: React.SyntheticEvent<HTMLAudioElement>): void {
    const nextTime = event.currentTarget.currentTime;
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
  }

  function handleAudioLoadedMetadata(event: React.SyntheticEvent<HTMLAudioElement>): void {
    const nextDuration = event.currentTarget.duration || track?.duration || 0;
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
  }

  return {
    audioRef,
    streamSource,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    canTranscode,
    effectiveTranscode,
    startPlayback,
    pausePlayback,
    onTogglePlayback,
    onSeek,
    onEnded,
    onCycleRepeatMode,
    onToggleShuffle,
    handleTranscodeModeChange,
    handleVolumeChange,
    setMuted,
    handleAudioPlay,
    handleAudioPause,
    handleAudioTimeUpdate,
    handleAudioLoadedMetadata
  };
}
