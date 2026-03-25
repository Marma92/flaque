import { coverPathUrl, coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { AlbumEntry, ArtistEntry } from "../types";
import { AlbumList } from "./AlbumList";

type LibraryArtistsSectionProps = {
  libraryMetadataError: string | null;
  loadingArtists: boolean;
  artists: ArtistEntry[];
  selectedArtist: ArtistEntry | null;
  artistAlbums: AlbumEntry[];
  selectedArtistAlbum: AlbumEntry | null;
  loadingArtistAlbums: boolean;
  onArtistSelect: (artist: ArtistEntry) => void;
  onArtistBack: () => void;
  onArtistAlbumSelect: (album: AlbumEntry) => void;
};

/**
 * Artist-focused section backed by the /api/artists endpoint.
 */
export function LibraryArtistsSection({
  libraryMetadataError,
  loadingArtists,
  artists,
  selectedArtist,
  artistAlbums,
  selectedArtistAlbum,
  loadingArtistAlbums,
  onArtistSelect,
  onArtistBack,
  onArtistAlbumSelect
}: LibraryArtistsSectionProps): JSX.Element {
  function getAlbumCoverSrc(album: AlbumEntry): string {
    if (album.cover) {
      return coverPathUrl(album.cover);
    }

    if (album.previewTrackId) {
      return coverUrl(album.previewTrackId);
    }

    return defaultCoverImage;
  }

  const isArtistSelected = selectedArtist !== null;

  return (
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h2 className="font-display text-xl text-flaque-ink">Artists</h2>
      {isArtistSelected ? (
        <>
          <button
            className="mt-2 inline-flex items-center rounded-lg border border-flaque-clay/70 bg-flaque-cream/40 px-2.5 py-1 text-xs font-medium text-flaque-steel transition hover:bg-flaque-cream hover:text-flaque-ink"
            type="button"
            onClick={onArtistBack}
          >
            back
          </button>
          <p className="mt-2 text-sm text-flaque-steel" title={selectedArtist.name}>
            Albums for <span className="font-medium text-flaque-ink">{selectedArtist.name}</span>
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-flaque-steel">Artist list from `/api/artists` based on your current owner/search filters.</p>
      )}

      {libraryMetadataError ? (
        <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{libraryMetadataError}</p>
      ) : null}

      {loadingArtists ? (
        <p className="mt-3 text-sm text-flaque-steel">Loading artists...</p>
      ) : artists.length === 0 && !isArtistSelected ? (
        <p className="mt-3 text-sm text-flaque-steel">No artists found for these filters.</p>
      ) : isArtistSelected && loadingArtistAlbums ? (
        <p className="mt-3 text-sm text-flaque-steel">Loading artist albums...</p>
      ) : isArtistSelected && artistAlbums.length === 0 ? (
        <p className="mt-3 text-sm text-flaque-steel">No albums found for this artist.</p>
      ) : isArtistSelected ? (
        <AlbumList
          albums={artistAlbums}
          selectedAlbum={selectedArtistAlbum}
          onAlbumSelect={onArtistAlbumSelect}
          getAlbumCoverSrc={getAlbumCoverSrc}
        />
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {artists.map((artist) => {
            const artistPhoto = artist.photo
              ? coverPathUrl(artist.photo)
              : artist.previewTrackId
                ? coverUrl(artist.previewTrackId)
                : defaultCoverImage;

            return (
              <button
                key={artist.name}
                className="rounded-xl border border-flaque-clay/60 bg-flaque-cream/45 px-3 py-2 text-left transition hover:bg-flaque-cream"
                title={artist.name}
                type="button"
                onClick={() => onArtistSelect(artist)}
              >
                <div className="flex items-center gap-2.5">
                  <img
                    className="h-11 w-11 shrink-0 rounded-lg border border-flaque-clay/50 object-cover"
                    src={artistPhoto}
                    alt={`Artwork for ${artist.name}`}
                    onError={(event) => {
                      event.currentTarget.src = defaultCoverImage;
                    }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-flaque-ink">{artist.name}</p>
                    <p className="text-xs text-flaque-steel">
                      {artist.trackCount} track{artist.trackCount > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
