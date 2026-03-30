import { coverPathUrl, coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { AlbumEntry, ArtistEntry, Playlist, Track } from "../types";
import { AlbumList } from "./AlbumList";
import { TrackList } from "./TrackList";

type LibraryArtistsSectionProps = {
  libraryMetadataError: string | null;
  loadingArtists: boolean;
  artists: ArtistEntry[];
  selectedArtist: ArtistEntry | null;
  artistAlbums: AlbumEntry[];
  selectedArtistAlbum: AlbumEntry | null;
  selectedArtistAlbumTracks: Track[];
  loadingSelectedArtistAlbumTracks: boolean;
  selectedArtistAlbumTracksError: string | null;
  loadingArtistAlbums: boolean;
  currentTrackId?: string;
  ownerNameById: Record<string, string>;
  onArtistSelect: (artist: ArtistEntry) => void;
  onArtistBack: () => void;
  onArtistAlbumSelect: (album: AlbumEntry) => void;
  onArtistAlbumBack: () => void;
  onArtistAlbumTrackSelect: (track: Track) => void;
  playlists?: Playlist[];
  onAddTrackToPlaylist?: (input: { trackId: string; playlistId: string }) => Promise<void> | void;
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
  selectedArtistAlbumTracks,
  loadingSelectedArtistAlbumTracks,
  selectedArtistAlbumTracksError,
  loadingArtistAlbums,
  currentTrackId,
  ownerNameById,
  onArtistSelect,
  onArtistBack,
  onArtistAlbumSelect,
  onArtistAlbumBack,
  onArtistAlbumTrackSelect,
  playlists,
  onAddTrackToPlaylist
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
  const isTracklistVisible = selectedArtistAlbum !== null;

  return (
    <section className="border m-4 rounded-xl border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
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
      ) : null }

      {libraryMetadataError ? (
        <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{libraryMetadataError}</p>
      ) : null}

      {loadingArtists ? (
        <p className="mt-3 text-sm text-flaque-steel">Loading artists...</p>
      ) : artists.length === 0 && !isArtistSelected ? (
        <p className="mt-3 text-sm text-flaque-steel">No artists found for these filters.</p>
      ) : isArtistSelected && isTracklistVisible ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-flaque-clay/60 bg-white/75">
          <div className="border-b border-flaque-clay/55 px-4 py-3">
            <button
              className="mb-2 inline-flex items-center rounded-lg border border-flaque-clay/70 bg-flaque-cream/40 px-2.5 py-1 text-xs font-medium text-flaque-steel transition hover:bg-flaque-cream hover:text-flaque-ink"
              type="button"
              onClick={onArtistAlbumBack}
            >
              back
            </button>
            <p className="text-xs uppercase tracking-[0.14em] text-flaque-steel">Album tracks</p>
            <p
              className="truncate text-sm text-flaque-ink"
              title={selectedArtistAlbum.artist ? `${selectedArtistAlbum.artist} - ${selectedArtistAlbum.name}` : selectedArtistAlbum.name}
            >
              {selectedArtistAlbum.artist ? `${selectedArtistAlbum.artist} - ${selectedArtistAlbum.name}` : selectedArtistAlbum.name}
            </p>
            {loadingSelectedArtistAlbumTracks ? (
              <p className="mt-1 text-xs text-flaque-steel">Loading album tracks...</p>
            ) : null}
            {selectedArtistAlbumTracksError ? (
              <p className="mt-1 text-xs text-red-700">{selectedArtistAlbumTracksError}</p>
            ) : null}
          </div>

          <TrackList
            tracks={selectedArtistAlbumTracks}
            currentTrackId={currentTrackId}
            ownerNameById={ownerNameById}
            onTrackSelect={onArtistAlbumTrackSelect}
            playlists={playlists}
            onAddTrackToPlaylist={onAddTrackToPlaylist}
            emptyMessage="No tracks found for this album."
          />
        </div>
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
