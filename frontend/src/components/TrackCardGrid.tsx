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

const DEFAULT_GRID = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

export function TrackCardGrid({
  tracks,
  onTrackSelect,
  gridClassName,
  ownerNameById,
  showOwner = false
}: TrackCardGridProps): JSX.Element {
  const resolveOwnerLabel = (owner: string): string => ownerNameById?.[owner] ?? owner;
  return (
    <div className={`mt-3 grid gap-2 ${gridClassName ?? DEFAULT_GRID}`}>
      {tracks.map((track) => {
        const title = getTrackDisplayTitle(track);
        const artist = getTrackDisplayArtist(track) ?? "Unknown artist";
        const albumWithYear = getTrackDisplayAlbumWithYear(track);

        return (
          <button
            key={track.id}
            className="w-full justify-self-start rounded-xl border border-flaque-clay/60 bg-flaque-cream/50 px-2.5 py-2 text-left transition hover:bg-flaque-cream sm:max-w-[18.5rem]"
            type="button"
            onClick={() => onTrackSelect(track)}
            title={title}
          >
            <div className="flex items-center gap-2.5">
              <img
                className="h-10 w-10 shrink-0 rounded-lg border border-flaque-clay/50 object-cover"
                src={coverUrl(track.id, track.cover)}
                alt={albumWithYear ? `Cover for ${albumWithYear}` : `Cover for ${title}`}
                onError={(event) => {
                  event.currentTarget.src = defaultCoverImage;
                }}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-flaque-ink">{title}</p>
                <p className="truncate text-xs text-flaque-steel">{artist}</p>
                {albumWithYear ? (
                  <p className="truncate text-[11px] text-flaque-steel/70">{albumWithYear}</p>
                ) : null}
                {showOwner ? (
                  <p className="truncate text-[11px] text-flaque-steel/70">{resolveOwnerLabel(track.owner)}</p>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
