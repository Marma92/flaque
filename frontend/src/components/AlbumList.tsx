import defaultCoverImage from "../assets/default-cover.png";
import type { AlbumEntry } from "../types";
import { getAlbumKey } from "../utils/appUtils";

export type AlbumListProps = {
  albums: AlbumEntry[];
  selectedAlbum: AlbumEntry | null;
  onAlbumSelect: (album: AlbumEntry) => void;
  getAlbumCoverSrc: (album: AlbumEntry) => string;
};

export function AlbumList({ albums, selectedAlbum, onAlbumSelect, getAlbumCoverSrc }: AlbumListProps): JSX.Element {
  const selectedKey = selectedAlbum ? getAlbumKey(selectedAlbum) : null;

  return (
    <div className="album-list mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {albums.map((album) => {
        const albumKey = getAlbumKey(album);
        const isSelected = selectedKey === albumKey;

        return (
          <button
            key={albumKey}
            className={`rounded-xl border px-3 py-2 text-left transition ${
              isSelected
                ? "border-flaque-ink bg-flaque-sand/25"
                : "border-flaque-clay/60 bg-flaque-cream/45 hover:bg-flaque-cream"
            }`}
            type="button"
            onClick={() => onAlbumSelect(album)}
            title={album.artist ? `${album.artist} - ${album.name}` : album.name}
          >
            <div className="flex items-center gap-2.5">
              <img
                className="h-11 w-11 shrink-0 rounded-lg border border-flaque-clay/50 object-cover"
                src={getAlbumCoverSrc(album)}
                alt={album.artist ? `Cover for ${album.artist} - ${album.name}` : `Cover for ${album.name}`}
                onError={(event) => {
                  event.currentTarget.src = defaultCoverImage;
                }}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-flaque-ink">{album.name}</p>
                <p className="truncate text-xs text-flaque-steel">{album.artist ?? "Unknown artist"}</p>
                <p className="text-xs text-flaque-steel/90">
                  {album.trackCount} track{album.trackCount > 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
