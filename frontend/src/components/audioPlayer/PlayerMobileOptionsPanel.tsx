import type { JSX } from "react";

import type { RepeatMode, TranscodeMode } from "../../hooks/useAudioPlayback";
import {
  CloseIcon,
  RepeatAllIcon,
  RepeatOneIcon,
  ShuffleIcon,
  VolumeMutedIcon,
  VolumeOnIcon
} from "./icons";

type PlayerMobileOptionsPanelProps = {
  ghostControlButtonClassName: string;
  qualitySelectClassName: string;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  transcodeMode: TranscodeMode;
  volume: number;
  muted: boolean;
  onClose: () => void;
  onCycleRepeatMode: () => void;
  onToggleShuffle: () => void;
  onShuffleEnabledChange?: (enabled: boolean) => void;
  onTranscodeModeChange: (mode: TranscodeMode) => void;
  onVolumeChange: (value: number) => void;
  onToggleMuted: () => void;
};

const repeatLabels = {
  off: { aria: "Enable repeat all", title: "Repeat off" },
  all: { aria: "Enable repeat one", title: "Repeat all" },
  one: { aria: "Disable repeat", title: "Repeat one" }
} satisfies Record<RepeatMode, { aria: string; title: string }>;

export function PlayerMobileOptionsPanel({
  ghostControlButtonClassName,
  qualitySelectClassName,
  repeatMode,
  shuffleEnabled,
  transcodeMode,
  volume,
  muted,
  onClose,
  onCycleRepeatMode,
  onToggleShuffle,
  onShuffleEnabledChange,
  onTranscodeModeChange,
  onVolumeChange,
  onToggleMuted
}: PlayerMobileOptionsPanelProps): JSX.Element {
  const repeatLabel = repeatLabels[repeatMode];
  const isVolumeMuted = muted || volume === 0;

  return (
    <div className="space-y-3 rounded-xl border border-flaque-clay/60 bg-flaque-cream/45 p-3 lg:hidden">
      <div className="flex items-center justify-end">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-flaque-clay bg-white text-flaque-ink transition hover:bg-flaque-sand"
          type="button"
          aria-label="Close player options"
          title="Close"
          onClick={onClose}
        >
          <CloseIcon className="h-4 w-4" strokeWidth={2} />
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
          aria-label={repeatLabel.aria}
          title={repeatLabel.title}
          onClick={onCycleRepeatMode}
        >
          {repeatMode === "one" ? <RepeatOneIcon /> : <RepeatAllIcon />}
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
          <ShuffleIcon />
        </button>
      </div>

      <label className="flex items-center justify-between gap-2 text-xs text-flaque-steel" htmlFor="player-quality-select-mobile">
        <span>Quality</span>
        <select
          id="player-quality-select-mobile"
          className={`${qualitySelectClassName} w-32`}
          value={transcodeMode}
          onChange={(event) => onTranscodeModeChange(event.target.value as TranscodeMode)}
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
          aria-label={isVolumeMuted ? "Unmute" : "Mute"}
          title={isVolumeMuted ? "Unmute" : "Mute"}
          onClick={onToggleMuted}
        >
          {isVolumeMuted ? <VolumeMutedIcon /> : <VolumeOnIcon />}
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
          onChange={(event) => onVolumeChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
