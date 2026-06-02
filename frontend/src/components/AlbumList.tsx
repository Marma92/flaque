import { memo } from "react";
import { useTranslation } from "react-i18next";

import type { AlbumEntry } from "../types";
import { getAlbumKey } from "../utils/appUtils";
import { defaultCoverImage, getAlbumCoverSrc } from "../utils/covers";
import { formatDurationHuman } from "../utils/format";

export type AlbumListProps = {
  albums: AlbumEntry[];
  selectedAlbum: AlbumEntry | null;
  onAlbumSelect: (album: AlbumEntry) => void;
  onPlayAlbum?: (album: AlbumEntry) => void;
};

export const AlbumList = memo(function AlbumList({ albums, selectedAlbum, onAlbumSelect, onPlayAlbum }: AlbumListProps): JSX.Element {
  const { t } = useTranslation(["library", "common"]);
  const selectedKey = selectedAlbum ? getAlbumKey(selectedAlbum) : null;

  return (
    <div className="album-list mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {albums.map((album) => {
        const albumKey = getAlbumKey(album);
        const isSelected = selectedKey === albumKey;
        const yearSuffix = album.year ? ` (${album.year})` : "";
        const playLabel = `${album.name}${yearSuffix}`;
        const albumLabel = album.artist ? `${album.artist} - ${playLabel}` : playLabel;

        return (
          <div
            key={albumKey}
            className={`rounded-xl p-2 text-left transition cursor-pointer ${
              isSelected
                ? "bg-flaque-sand/25"
                : "hover:bg-flaque-cream/60"
            }`}
            onClick={() => onAlbumSelect(album)}
            title={albumLabel}
          >
            <div className="group relative">
              <img
                className="aspect-square w-full object-cover"
                src={getAlbumCoverSrc(album)}
                alt={t("library:albumCard.coverAlt", { album: albumLabel })}
                onError={(event) => {
                  event.currentTarget.src = defaultCoverImage;
                }}
              />
              {onPlayAlbum ? (
                <button
                  className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"
                  type="button"
                  aria-label={t("library:albumCard.play", { album: playLabel })}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPlayAlbum(album);
                  }}
                >
                  <svg className="h-10 w-10 text-[#ffffff] drop-shadow-md" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 6v12l10-6-10-6z" />
                  </svg>
                </button>
              ) : null}
            </div>
            <div className="mt-1.5 min-w-0 px-0.5">
              <p className="truncate text-xs font-medium text-flaque-ink">{album.name}</p>
              <p className="truncate text-xs text-flaque-steel">{album.artist ?? t("common:unknownArtist")}</p>
              {album.year ? <p className="text-xs text-flaque-steel/90">{album.year}</p> : null}
              <p className="text-xs text-flaque-steel/70">
                {t("common:trackCount", { count: album.trackCount })}
                {album.totalDuration ? ` · ${formatDurationHuman(album.totalDuration)}` : ""}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
});
