import type { CSSProperties, JSX } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("player");
  const repeatLabels = {
    off: { aria: t("repeat.enableAllAria"), title: t("repeat.offTitle") },
    all: { aria: t("repeat.enableOneAria"), title: t("repeat.allTitle") },
    one: { aria: t("repeat.disableAria"), title: t("repeat.oneTitle") }
  } satisfies Record<RepeatMode, { aria: string; title: string }>;
  const repeatLabel = repeatLabels[repeatMode];
  const isVolumeMuted = muted || volume === 0;

  return (
    <div className="space-y-3 rounded-xl border border-flaque-clay/60 bg-flaque-cream/45 p-3 lg:hidden">
      <div className="flex items-center justify-end">
        <button
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-flaque-clay bg-white text-flaque-ink transition duration-200 ease-swift hover:bg-flaque-sand active:scale-95"
          type="button"
          aria-label={t("controls.closeOptions")}
          title={t("controls.close")}
          onClick={onClose}
        >
          <CloseIcon className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          className={`focus-ring flex h-9 items-center justify-center rounded-xl transition duration-200 ease-swift active:scale-95 ${
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
          className={`focus-ring flex h-9 items-center justify-center rounded-xl transition duration-200 ease-swift active:scale-95 ${
            shuffleEnabled
              ? "bg-flaque-ink text-flaque-cream hover:bg-flaque-steel"
              : "bg-flaque-cream/80 text-flaque-ink hover:bg-flaque-sand"
          }`}
          type="button"
          aria-label={shuffleEnabled ? t("controls.disableShuffle") : t("controls.enableShuffle")}
          title={shuffleEnabled ? t("controls.shuffleOn") : t("controls.shuffleOff")}
          onClick={onToggleShuffle}
          disabled={!onShuffleEnabledChange}
        >
          <ShuffleIcon />
        </button>
      </div>

      <label className="flex items-center justify-between gap-2 text-xs text-flaque-steel" htmlFor="player-quality-select-mobile">
        <span>{t("quality.label")}</span>
        <select
          id="player-quality-select-mobile"
          className={`${qualitySelectClassName} w-32`}
          value={transcodeMode}
          onChange={(event) => onTranscodeModeChange(event.target.value as TranscodeMode)}
        >
          <option value="original">{t("quality.original")}</option>
          <option value="opus">{t("quality.opus")}</option>
          <option value="mp3">{t("quality.mp3")}</option>
        </select>
      </label>

      <div className="flex items-center gap-2">
        <button
          className={ghostControlButtonClassName}
          type="button"
          aria-label={isVolumeMuted ? t("controls.unmute") : t("controls.mute")}
          title={isVolumeMuted ? t("controls.unmute") : t("controls.mute")}
          onClick={onToggleMuted}
        >
          {isVolumeMuted ? <VolumeMutedIcon /> : <VolumeOnIcon />}
        </button>

        <input
          className="flaque-range h-2 flex-1 cursor-pointer appearance-none rounded-full"
          style={{ "--range-progress": `${volume * 100}%` } as CSSProperties}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          aria-label={t("controls.volume")}
          title={t("controls.volume")}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
