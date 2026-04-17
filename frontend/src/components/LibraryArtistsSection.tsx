import { useState } from "react";

import { coverPathUrl, coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { AlbumEntry, ArtistEntry, Playlist, Track } from "../types";
import { formatDurationHuman } from "../utils/format";
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
  onPlayAlbum?: (album: AlbumEntry) => void;
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
  onPlayAlbum,
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

  const [searchQuery, setSearchQuery] = useState("");
  const isArtistSelected = selectedArtist !== null;
  const isTracklistVisible = selectedArtistAlbum !== null;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredArtists = normalizedQuery
    ? artists.filter((artist) => artist.name.toLowerCase().includes(normalizedQuery))
    : artists;

  const artistPhotoSrc = selectedArtist
    ? (selectedArtist.photo
        ? coverPathUrl(selectedArtist.photo)
        : selectedArtist.previewTrackId
          ? coverUrl(selectedArtist.previewTrackId)
          : defaultCoverImage)
    : defaultCoverImage;

  return (
    <>
      {/* Album header — transparent, when viewing album tracks */}
      {isArtistSelected && isTracklistVisible && selectedArtistAlbum && (
        <div className="mx-4 mt-4 px-4 py-6">
          <div className="flex items-center gap-6">
            <img
              className="h-36 w-36 shrink-0 object-cover shadow-md"
              src={getAlbumCoverSrc(selectedArtistAlbum)}
              alt={selectedArtistAlbum.name}
              onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
            />
            <div className="min-w-0">
              <h3 className="truncate font-display text-4xl font-bold text-flaque-ink">{selectedArtistAlbum.name}</h3>
              <p className="mt-1 text-base text-flaque-steel">
                {selectedArtistAlbum.artist ?? selectedArtist.name}
              </p>
              <p className="mt-0.5 text-sm text-flaque-steel">
                {selectedArtistAlbum.year ? `${selectedArtistAlbum.year} · ` : ""}
                {selectedArtistAlbum.trackCount} track{selectedArtistAlbum.trackCount !== 1 ? "s" : ""}
                {selectedArtistAlbum.totalDuration ? ` · ${formatDurationHuman(selectedArtistAlbum.totalDuration)}` : ""}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Artist header — transparent, above the main section */}
      {isArtistSelected && !isTracklistVisible && (
        <div className="mx-4 mt-4 px-4 py-6">
          <div className="flex items-center gap-6">
            <img
              className="h-36 w-36 shrink-0 rounded-full border-2 border-flaque-clay/50 object-cover shadow-md"
              src={artistPhotoSrc}
              alt={selectedArtist.name}
              onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
            />
            <div className="min-w-0">
              <h3 className="truncate font-display text-4xl font-bold text-flaque-ink">{selectedArtist.name}</h3>
              <p className="mt-1 text-sm text-flaque-steel">
                {selectedArtist.albumCount} album{selectedArtist.albumCount !== 1 ? "s" : ""}
                {" · "}
                {selectedArtist.trackCount} track{selectedArtist.trackCount !== 1 ? "s" : ""}
                {" · "}
                {formatDurationHuman(selectedArtist.totalDuration)}
              </p>
            </div>
          </div>
        </div>
      )}

    <section className="border m-4 rounded-xl border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      {!isArtistSelected && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-display text-xl text-flaque-ink">Artists</h2>
          <input
            className="rounded-lg border border-flaque-clay/70 bg-flaque-cream/40 px-3 py-1.5 text-sm text-flaque-ink placeholder:text-flaque-steel/60 focus:border-flaque-ink/40 focus:outline-none"
            type="text"
            placeholder="Search artists..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}
      {isArtistSelected ? (
        <button
          className={`inline-flex items-center rounded-lg border border-flaque-clay/70 bg-flaque-cream/40 px-2.5 py-1 text-xs font-medium text-flaque-steel transition hover:bg-flaque-cream hover:text-flaque-ink${isTracklistVisible ? " mb-3" : ""}`}
          type="button"
          onClick={isTracklistVisible ? onArtistAlbumBack : onArtistBack}
          aria-label="Back"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
      ) : (
        <p className="mt-1 text-sm text-flaque-steel"></p>
      )}

      {libraryMetadataError ? (
        <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{libraryMetadataError}</p>
      ) : null}

      {loadingArtists ? (
        <p className="mt-3 text-sm text-flaque-steel">Loading artists...</p>
      ) : filteredArtists.length === 0 && !isArtistSelected ? (
        <p className="mt-3 text-sm text-flaque-steel">No artists found{normalizedQuery ? ` matching "${searchQuery.trim()}"` : " for these filters"}.</p>
      ) : isArtistSelected && isTracklistVisible ? (
        <div className="overflow-hidden rounded-2xl border border-flaque-clay/60 bg-white/75">
          {loadingSelectedArtistAlbumTracks ? (
            <p className="px-4 py-3 text-xs text-flaque-steel">Loading album tracks...</p>
          ) : null}
          {selectedArtistAlbumTracksError ? (
            <p className="px-4 py-3 text-xs text-red-700">{selectedArtistAlbumTracksError}</p>
          ) : null}

          <TrackList
            tracks={selectedArtistAlbumTracks}
            currentTrackId={currentTrackId}
            ownerNameById={ownerNameById}
            onTrackSelect={onArtistAlbumTrackSelect}
            playlists={playlists}
            onAddTrackToPlaylist={onAddTrackToPlaylist}
            emptyMessage="No tracks found for this album."
            constrainHeight={false}
            showTrackNumber
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
          onPlayAlbum={onPlayAlbum}
          getAlbumCoverSrc={getAlbumCoverSrc}
        />
      ) : (
        <div className="mt-3">
          {(() => {
            const grouped = new Map<string, ArtistEntry[]>();
            for (const artist of filteredArtists) {
              const first = artist.name[0]?.toUpperCase() ?? "#";
              const letter = /[A-Z]/.test(first) ? first : "#";
              const list = grouped.get(letter);
              if (list) {
                list.push(artist);
              } else {
                grouped.set(letter, [artist]);
              }
            }
            const sortedKeys = [...grouped.keys()].sort((a, b) =>
              a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)
            );

            return sortedKeys.map((letter, idx) => (
              <div key={letter}>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-flaque-steel">{letter}</span>
                  <div className="flex-1 h-[2px] border-t-[2px] border-flaque-clay/40" style={{ maskImage: "linear-gradient(to right, black 50%, transparent)", WebkitMaskImage: "linear-gradient(to right, black 50%, transparent)" }} />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {grouped.get(letter)!.map((artist) => {
                    const artistPhoto = artist.photo
                      ? coverPathUrl(artist.photo)
                      : artist.previewTrackId
                        ? coverUrl(artist.previewTrackId)
                        : defaultCoverImage;

                    return (
                      <button
                        key={artist.name}
                        className="aspect-square rounded-xl bg-white/85 p-3 text-center transition hover:bg-flaque-cream"
                        title={artist.name}
                        type="button"
                        onClick={() => onArtistSelect(artist)}
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
                  })}
                </div>
                {idx < sortedKeys.length - 1 && <div className="mb-4" />}
              </div>
            ));
          })()}
        </div>
      )}
    </section>
    </>
  );
}
