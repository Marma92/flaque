import type { AlbumEntry } from "../types";
import { getAlbumKey } from "../utils/appUtils";
import defaultCoverImage from "../assets/default-cover.png";

type AlbumCoverflowProps = {
  albums: AlbumEntry[];
  selectedAlbum: AlbumEntry | null;
  onAlbumSelect: (album: AlbumEntry) => void;
  getAlbumCoverSrc: (album: AlbumEntry) => string;
};

export function AlbumCoverflow({ albums, selectedAlbum, onAlbumSelect, getAlbumCoverSrc }: AlbumCoverflowProps): JSX.Element {
  if (albums.length === 0) {
    return <p className="mt-3 text-sm text-flaque-steel">No albums found for these filters.</p>;
  }

  const selectedIndex = selectedAlbum ? albums.findIndex((album) => getAlbumKey(album) === getAlbumKey(selectedAlbum)) : -1;
  const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const activeAlbum = albums[activeIndex];

  function selectOffset(direction: -1 | 1): void {
    if (albums.length <= 1) {
      return;
    }

    const nextIndex = (activeIndex + direction + albums.length) % albums.length;
    onAlbumSelect(albums[nextIndex]);
  }

  return (
    <div className="mt-3 rounded-2xl border border-flaque-clay/60 bg-flaque-cream/40 px-3 py-4 sm:px-4">
      <div className="relative h-[280px] overflow-hidden rounded-xl [perspective:1100px] sm:h-[320px]">
        {albums.map((album, index) => {
          const offset = index - activeIndex;
          const distance = Math.abs(offset);
          const visible = distance <= 4;

          if (!visible) {
            return null;
          }

          const xOffset = offset * 120;
          const rotateY = offset * -18;
          const scale = Math.max(0.58, 1 - distance * 0.14);
          const opacity = Math.max(0.18, 1 - distance * 0.2);
          const zIndex = 50 - distance;

          return (
            <button
              key={`${album.artist ?? "unknown"}-${album.name}`}
              className="absolute left-1/2 top-5 h-[220px] w-[170px] -translate-x-1/2 rounded-xl border border-flaque-clay/70 bg-white/95 p-2 text-left shadow-lg transition duration-300 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-ink/50 sm:h-[250px] sm:w-[190px]"
              style={{
                transform: `translateX(calc(-50% + ${xOffset}px)) translateZ(${distance === 0 ? 20 : 0}px) rotateY(${rotateY}deg) scale(${scale})`,
                opacity,
                zIndex
              }}
              type="button"
              onClick={() => onAlbumSelect(album)}
              title={album.artist ? `${album.artist} - ${album.name}` : album.name}
            >
              <img
                className="h-[145px] w-full rounded-md border border-flaque-clay/50 object-cover sm:h-[165px]"
                src={getAlbumCoverSrc(album)}
                alt={album.artist ? `Cover for ${album.artist} - ${album.name}` : `Cover for ${album.name}`}
                onError={(event) => {
                  event.currentTarget.src = defaultCoverImage;
                }}
              />
              <p className="mt-2 truncate text-sm font-medium text-flaque-ink">{album.name}</p>
              <p className="truncate text-xs text-flaque-steel">{album.artist ?? "Unknown artist"}</p>
              <p className="text-xs text-flaque-steel/90">
                {album.trackCount} track{album.trackCount > 1 ? "s" : ""}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          className="rounded-lg border border-flaque-clay/70 bg-white/80 px-3 py-1.5 text-sm text-flaque-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={() => selectOffset(-1)}
          disabled={albums.length <= 1}
        >
          Prev
        </button>
        <p className="min-w-0 text-center text-sm text-flaque-steel" title={activeAlbum.artist ? `${activeAlbum.artist} - ${activeAlbum.name}` : activeAlbum.name}>
          <span className="font-medium text-flaque-ink">{activeAlbum.name}</span>
          <span className="mx-1">-</span>
          <span>{activeAlbum.artist ?? "Unknown artist"}</span>
        </p>
        <button
          className="rounded-lg border border-flaque-clay/70 bg-white/80 px-3 py-1.5 text-sm text-flaque-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={() => selectOffset(1)}
          disabled={albums.length <= 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}
