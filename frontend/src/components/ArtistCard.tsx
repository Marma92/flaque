import { memo, useCallback } from "react";

import type { ArtistEntry } from "../types";
import { defaultCoverImage, getArtistPhotoSrc } from "../utils/covers";
import { formatDurationHuman } from "../utils/format";

type ArtistCardProps = {
  artist: ArtistEntry;
  onSelect: (artist: ArtistEntry) => void;
};

export const ArtistCard = memo(function ArtistCard({ artist, onSelect }: ArtistCardProps): JSX.Element {
  const artistPhoto = getArtistPhotoSrc(artist);
  const handleClick = useCallback(() => onSelect(artist), [artist, onSelect]);

  return (
    <button
      className="aspect-square rounded-xl bg-white/85 p-3 text-center transition hover:bg-flaque-cream"
      title={artist.name}
      type="button"
      onClick={handleClick}
    >
      <img
        className="mx-auto h-full max-h-44 w-full max-w-44 rounded-full border border-flaque-clay/50 object-cover"
        src={artistPhoto}
        alt={`Artwork for ${artist.name}`}
        onError={(event) => {
          event.currentTarget.src = defaultCoverImage;
        }}
      />
      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-medium text-flaque-ink">{artist.name}</p>
        <p className="text-xs text-flaque-steel">
          {artist.albumCount} album{artist.albumCount !== 1 ? "s" : ""}
          {" · "}
          {artist.trackCount} track{artist.trackCount !== 1 ? "s" : ""}
          {" · "}
          {formatDurationHuman(artist.totalDuration)}
        </p>
      </div>
    </button>
  );
});
