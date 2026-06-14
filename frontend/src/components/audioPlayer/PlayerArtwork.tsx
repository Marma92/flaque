import type { JSX } from "react";
import { useTranslation } from "react-i18next";

import { coverUrl } from "../../api";
import defaultCoverImage from "../../assets/default-cover.png";
import type { Track } from "../../types";
import type { SyncedLyricsLine } from "../../utils/tracks";
import { SyncedLyricsOverlay } from "../SyncedLyricsOverlay";
import { CloseIcon } from "./icons";

type PlayerArtworkProps = {
  track: Track;
  expanded: boolean;
  artworkClassName: string;
  isRadioMode: boolean;
  isRadioStopped: boolean;
  hasLyrics: boolean;
  displayLyrics: string | undefined;
  syncedLyrics: SyncedLyricsLine[] | null;
  displayAlbumWithYear: string | undefined;
  showLyricsOverlay: boolean;
  onToggleLyricsOverlay: () => void;
  onCloseLyricsOverlay: () => void;
  currentTime: number;
  onArtworkClick?: () => void;
};

export function PlayerArtwork({
  track,
  expanded,
  artworkClassName,
  isRadioMode,
  isRadioStopped,
  hasLyrics,
  displayLyrics,
  syncedLyrics,
  displayAlbumWithYear,
  showLyricsOverlay,
  onToggleLyricsOverlay,
  onCloseLyricsOverlay,
  currentTime,
  onArtworkClick
}: PlayerArtworkProps): JSX.Element {
  const { t } = useTranslation("player");
  const altText = displayAlbumWithYear
    ? t("artwork.coverAlt", { name: displayAlbumWithYear })
    : t("artwork.coverAltGeneric");

  if (expanded) {
    return (
      <div className="relative shrink-0 overflow-hidden rounded-2xl">
        {isRadioMode && !isRadioStopped ? (
          <div className="absolute left-4 top-4 z-30 rounded-md border border-[rgba(255,255,255,0.5)] bg-[#ffffff] p-1 shadow-sm">
            <img className="h-10 w-10" src="/radio.png" alt={t("artwork.radioMode")} />
          </div>
        ) : null}
        {hasLyrics && !isRadioStopped ? (
          <button
            className="absolute inset-0 z-10 cursor-pointer"
            type="button"
            onClick={onToggleLyricsOverlay}
            aria-pressed={showLyricsOverlay}
            aria-label={showLyricsOverlay ? t("artwork.hideLyrics") : t("artwork.showLyrics")}
          />
        ) : null}
        {isRadioStopped ? (
          <div className={`${artworkClassName} border border-[rgba(255,255,255,0.5)] bg-[#ffffff] flex items-center justify-center`}>
            <img className="h-30 w-30" src="/radio.png" alt={t("artwork.radio")} />
          </div>
        ) : (
          <img
            className={artworkClassName}
            src={coverUrl(track.id, track.cover)}
            alt={altText}
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
              onClick={onCloseLyricsOverlay}
              aria-label={t("artwork.closeLyrics")}
            >
              <CloseIcon />
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
    );
  }

  return (
    <div className="relative shrink-0">
      {isRadioMode && !isRadioStopped ? (
        <div className="absolute left-2 top-2 z-20 rounded-md border border-[rgba(255,255,255,0.5)] bg-[#ffffff] p-1 shadow-sm">
          <img className="h-3.5 w-3.5" src="/radio.png" alt={t("artwork.radioMode")} />
        </div>
      ) : null}
      {isRadioStopped ? (
        <div className={`${artworkClassName} flex items-center justify-center border border-[rgba(255,255,255,0.5)] bg-[#ffffff]`}>
          <img className="h-10 w-10" src="/radio.png" alt={t("artwork.radio")} />
        </div>
      ) : onArtworkClick ? (
        <button
          className="shrink-0 rounded-2xl"
          type="button"
          aria-label={t("artwork.openPlayerView")}
          onClick={onArtworkClick}
        >
          <img
            className={`${artworkClassName} cursor-pointer`}
            src={coverUrl(track.id, track.cover)}
            alt={altText}
            onError={(event) => {
              event.currentTarget.src = defaultCoverImage;
            }}
          />
        </button>
      ) : (
        <img
          className={artworkClassName}
          src={coverUrl(track.id, track.cover)}
          alt={altText}
          onError={(event) => {
            event.currentTarget.src = defaultCoverImage;
          }}
        />
      )}
    </div>
  );
}
