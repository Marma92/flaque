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
const SKIP_TIME_THRESHOLD_SECONDS = 30;
const SKIP_RATIO_THRESHOLD = 0.5;
// Pressing "previous" past this point restarts the current track instead of
// jumping to the previous one (matches the convention used by most players).
const PREVIOUS_RESTART_THRESHOLD_SECONDS = 5;

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
  playRequestOffsetSec?: number;
  onNext?: (options?: NavigateOptions) => Promise<void> | void;
  onPrevious?: (options?: NavigateOptions) => Promise<void> | void;
  onTrackPlayed?: (track: Track) => void;
  onTrackSkipped?: (track: Track) => void;
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
  handlePrevious: (options?: NavigateOptions) => void;
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
  playRequestOffsetSec = 0,
  onNext,
  onPrevious,
  onTrackPlayed,
  onTrackSkipped
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
  const previousTrackRef = useRef<Track | null>(null);
  const endedNaturallyRef = useRef(false);

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
    if (!audioElement) {
      return;
    }
    if (!track) {
      // Queue cleared. Drop the previous-track reference so we don't fire a
      // bogus skip when the user later starts a new track.
      previousTrackRef.current = null;
      endedNaturallyRef.current = false;
      currentTimeRef.current = 0;
      return;
    }

    const previousTrack = previousTrackRef.current;
    if (previousTrack && previousTrack.id !== track.id && !endedNaturallyRef.current) {
      const elapsed = currentTimeRef.current;
      const total = previousTrack.duration || 0;
      const ratio = total > 0 ? elapsed / total : 0;
      if (elapsed > 0 && elapsed < SKIP_TIME_THRESHOLD_SECONDS && ratio < SKIP_RATIO_THRESHOLD) {
        onTrackSkipped?.(previousTrack);
      }
    }
    endedNaturallyRef.current = false;
    previousTrackRef.current = track;

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

    const maxSeek = Math.max(0, (track.duration || 0) - 0.25);
    const boundedOffset = Math.min(Math.max(0, playRequestOffsetSec), maxSeek || playRequestOffsetSec);
    audioRef.current.currentTime = boundedOffset;
    currentTimeRef.current = boundedOffset;
    setCurrentTime(boundedOffset);
    audioRef.current
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch(() => {
        setIsPlaying(false);
      });
  }, [playRequestNonce, playRequestOffsetSec, track?.id, track?.duration]);

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
      const rawCoverUrl = coverUrl(track.id, track.cover);
      const absoluteCoverUrl =
        typeof window !== "undefined" && rawCoverUrl.startsWith("/")
          ? `${window.location.origin}${rawCoverUrl}`
          : rawCoverUrl;
      mediaSession.metadata = new MediaMetadata({
        title: getTrackDisplayTitle(track),
        artist,
        album,
        artwork: [
          { src: absoluteCoverUrl, sizes: "96x96", type: "image/jpeg" },
          { src: absoluteCoverUrl, sizes: "128x128", type: "image/jpeg" },
          { src: absoluteCoverUrl, sizes: "192x192", type: "image/jpeg" },
          { src: absoluteCoverUrl, sizes: "256x256", type: "image/jpeg" },
          { src: absoluteCoverUrl, sizes: "384x384", type: "image/jpeg" },
          { src: absoluteCoverUrl, sizes: "512x512", type: "image/jpeg" }
        ]
      });
    }
    mediaSession.playbackState = isPlaying ? "playing" : "paused";

    bindAction("play", () => startPlayback());
    bindAction("pause", () => pausePlayback());
    bindAction("stop", () => pausePlayback());
    bindAction("previoustrack", () => {
      handlePrevious({ wrap: false });
    });
    bindAction("nexttrack", () => {
      if (onNext) {
        void onNext({ wrap: false });
      }
    });
    bindAction("seekbackward", (details) => {
      const audioElement = audioRef.current;
      if (!audioElement) return;
      const offset = details.seekOffset ?? 10;
      const next = Math.max(0, audioElement.currentTime - offset);
      audioElement.currentTime = next;
      currentTimeRef.current = next;
      setCurrentTime(next);
    });
    bindAction("seekforward", (details) => {
      const audioElement = audioRef.current;
      if (!audioElement) return;
      const offset = details.seekOffset ?? 10;
      const max = Number.isFinite(audioElement.duration) && audioElement.duration > 0
        ? audioElement.duration
        : Number.POSITIVE_INFINITY;
      const next = Math.min(max, audioElement.currentTime + offset);
      audioElement.currentTime = next;
      currentTimeRef.current = next;
      setCurrentTime(next);
    });
    bindAction("seekto", (details) => {
      const audioElement = audioRef.current;
      if (!audioElement || typeof details.seekTime !== "number") return;
      if (details.fastSeek && typeof audioElement.fastSeek === "function") {
        audioElement.fastSeek(details.seekTime);
      } else {
        audioElement.currentTime = details.seekTime;
      }
      currentTimeRef.current = details.seekTime;
      setCurrentTime(details.seekTime);
    });

    return () => {
      bindAction("play", null);
      bindAction("pause", null);
      bindAction("stop", null);
      bindAction("previoustrack", null);
      bindAction("nexttrack", null);
      bindAction("seekbackward", null);
      bindAction("seekforward", null);
      bindAction("seekto", null);
    };
  }, [isPlaying, onNext, onPrevious, track]);

  // ── Media Session position state ──────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    const mediaSession = navigator.mediaSession;
    if (typeof mediaSession.setPositionState !== "function") {
      return;
    }

    if (!track || !duration || !Number.isFinite(duration)) {
      try {
        mediaSession.setPositionState();
      } catch {
        // ignored
      }
      return;
    }

    const safePosition = Math.min(Math.max(0, currentTime), duration);
    try {
      mediaSession.setPositionState({
        duration,
        position: safePosition,
        playbackRate: audioRef.current?.playbackRate ?? 1
      });
    } catch {
      // ignored — can throw if values are invalid (e.g., during a seek)
    }
  }, [currentTime, duration, track?.id]);

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

  function handlePrevious(options?: NavigateOptions): void {
    const audioElement = audioRef.current;
    // If we're already a few seconds into the track, "previous" restarts it
    // rather than skipping back to the prior track.
    if (audioElement && audioElement.currentTime > PREVIOUS_RESTART_THRESHOLD_SECONDS) {
      audioElement.currentTime = 0;
      currentTimeRef.current = 0;
      setCurrentTime(0);
      return;
    }

    if (onPrevious) {
      void onPrevious(options);
    }
  }

  function onEnded(): void {
    const audioElement = audioRef.current;
    if (!audioElement) {
      return;
    }

    endedNaturallyRef.current = true;

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
    handlePrevious,
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
