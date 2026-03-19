import { coverPathUrl, coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { AlbumEntry, Track } from "../types";
import { getAlbumKey } from "../utils/appUtils";
import { TrackList } from "./TrackList";

type LibraryAlbumsSectionProps = {
  libraryMetadataError: string | null;
  loadingAlbums: boolean;
  albums: AlbumEntry[];
  selectedAlbum: AlbumEntry | null;
  selectedAlbumTracks: Track[];
  loadingSelectedAlbumTracks: boolean;
  selectedAlbumTracksError: string | null;
  currentTrackId?: string;
  ownerNameById: Record<string, string>;
  onAlbumSelect: (album: AlbumEntry) => void;
  onTrackSelect: (track: Track) => void;
};

/**
 * Album-focused section backed by /api/albums and /api/albums/:id/tracks.
 */
export function LibraryAlbumsSection({
  libraryMetadataError,
  loadingAlbums,
  albums,
  selectedAlbum,
  selectedAlbumTracks,
  loadingSelectedAlbumTracks,
  selectedAlbumTracksError,
  currentTrackId,
  ownerNameById,
  onAlbumSelect,
  onTrackSelect
}: LibraryAlbumsSectionProps): JSX.Element {
  return (
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h2 className="font-display text-xl text-flaque-ink">Albums</h2>
      <p className="mt-1 text-sm text-flaque-steel">Album list from `/api/albums` based on your current owner/artist/search filters.</p>

      {libraryMetadataError ? (
        <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{libraryMetadataError}</p>
      ) : null}

      {loadingAlbums ? (
        <p className="mt-3 text-sm text-flaque-steel">Loading albums...</p>
      ) : albums.length === 0 ? (
        <p className="mt-3 text-sm text-flaque-steel">No albums found for these filters.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {albums.map((album) => {
              const selected = selectedAlbum ? getAlbumKey(selectedAlbum) === getAlbumKey(album) : false;

              return (
                <button
                  key={`${album.artist ?? "unknown"}-${album.name}`}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    selected
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
                      src={
                        album.cover
                          ? coverPathUrl(album.cover)
                          : album.previewTrackId
                            ? coverUrl(album.previewTrackId)
                            : defaultCoverImage
                      }
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

          {selectedAlbum ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-flaque-clay/60 bg-white/75">
              <div className="border-b border-flaque-clay/55 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-flaque-steel">Album tracks</p>
                <p
                  className="truncate text-sm text-flaque-ink"
                  title={selectedAlbum.artist ? `${selectedAlbum.artist} - ${selectedAlbum.name}` : selectedAlbum.name}
                >
                  {selectedAlbum.artist ? `${selectedAlbum.artist} - ${selectedAlbum.name}` : selectedAlbum.name}
                </p>
                {loadingSelectedAlbumTracks ? (
                  <p className="mt-1 text-xs text-flaque-steel">Loading album tracks...</p>
                ) : null}
                {selectedAlbumTracksError ? (
                  <p className="mt-1 text-xs text-red-700">{selectedAlbumTracksError}</p>
                ) : null}
              </div>

              <TrackList
                tracks={selectedAlbumTracks}
                currentTrackId={currentTrackId}
                ownerNameById={ownerNameById}
                onTrackSelect={onTrackSelect}
                emptyMessage="No tracks found for this album."
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
