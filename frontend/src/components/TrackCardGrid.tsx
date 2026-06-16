import { useTranslation } from "react-i18next";

import { coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { Track } from "../types";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayTitle
} from "../utils/tracks";

type TrackCardGridProps = {
  tracks: Track[];
  onTrackSelect: (track: Track) => void;
  gridClassName?: string;
  ownerNameById?: Record<string, string>;
  showOwner?: boolean;
};

const DEFAULT_GRID = "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export function TrackCardGrid({
  tracks,
  onTrackSelect,
  gridClassName,
  ownerNameById,
  showOwner = false
}: TrackCardGridProps): JSX.Element {
  const { t } = useTranslation(["library", "common"]);
  const resolveOwnerLabel = (owner: string): string => ownerNameById?.[owner] ?? owner;
  return (
    <div className={`mt-3 grid gap-2.5 ${gridClassName ?? DEFAULT_GRID}`}>
      {tracks.map((track) => {
        const title = getTrackDisplayTitle(track);
        const artist = getTrackDisplayArtist(track) ?? t("common:unknownArtist");
        const albumWithYear = getTrackDisplayAlbumWithYear(track);

        return (
          <button
            key={track.id}
            className="flaque-card w-full p-2.5 text-left"
            type="button"
            onClick={() => onTrackSelect(track)}
            title={title}
          >
            <div className="flex items-start gap-3">
              <img
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
                src={coverUrl(track.id, track.cover)}
                alt={t("library:track.coverAlt", { name: albumWithYear ?? title })}
                onError={(event) => {
                  event.currentTarget.src = defaultCoverImage;
                }}
              />
              <div className="min-w-0 pt-0.5">
                <p className="truncate text-sm font-medium text-flaque-ink">{title}</p>
                <p className="mt-0.5 truncate text-xs text-flaque-steel">{artist}</p>
                {albumWithYear ? (
                  <p className="truncate text-[11px] text-flaque-steel/70">{albumWithYear}</p>
                ) : null}
                {showOwner ? (
                  <p className="truncate text-[11px] text-flaque-steel/50">{resolveOwnerLabel(track.owner)}</p>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
