import { coverPathUrl, coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { AlbumEntry, Playlist, Track } from "../types";
import { getAlbumKey } from "../utils/appUtils";
import { useState } from "react";
import { Coverflow } from "./Coverflow";
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
  playlists?: Playlist[];
  onAddTrackToPlaylist?: (input: { trackId: string; playlistId: string }) => Promise<void> | void;
};

type AlbumViewMode = "list" | "coverflow";

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
  onTrackSelect,
  playlists,
  onAddTrackToPlaylist
}: LibraryAlbumsSectionProps): JSX.Element {
  const [viewMode, setViewMode] = useState<AlbumViewMode>("list");

  function getAlbumCoverSrc(album: AlbumEntry): string {
    if (album.cover) {
      return coverPathUrl(album.cover);
    }

    if (album.previewTrackId) {
      return coverUrl(album.previewTrackId);
    }

    return defaultCoverImage;
  }

  return (
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-flaque-ink">Albums</h2>
          <p className="mt-1 text-sm text-flaque-steel">Album list from `/api/albums` based on your current owner/artist/search filters.</p>
        </div>

        <div className="inline-flex rounded-xl border border-flaque-clay/70 bg-flaque-cream/50 p-1">
          <button
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              viewMode === "list" ? "bg-white text-flaque-ink shadow-sm" : "text-flaque-steel hover:text-flaque-ink"
            }`}
            type="button"
            onClick={() => setViewMode("list")}
          >
            List
          </button>
          <button
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              viewMode === "coverflow" ? "bg-white text-flaque-ink shadow-sm" : "text-flaque-steel hover:text-flaque-ink"
            }`}
            type="button"
            onClick={() => setViewMode("coverflow")}
          >
            Coverflow
          </button>
        </div>
      </div>

      {libraryMetadataError ? (
        <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{libraryMetadataError}</p>
      ) : null}

      {loadingAlbums ? (
        <p className="mt-3 text-sm text-flaque-steel">Loading albums...</p>
      ) : albums.length === 0 ? (
        <p className="mt-3 text-sm text-flaque-steel">No albums found for these filters.</p>
      ) : (
        <>
          {viewMode === "coverflow" ? (
            <Coverflow
              albums={albums}
              selectedAlbum={selectedAlbum}
              onAlbumSelect={onAlbumSelect}
              getAlbumCoverSrc={getAlbumCoverSrc}
            />
          ) : (
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
          )}

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
                playlists={playlists}
                onAddTrackToPlaylist={onAddTrackToPlaylist}
                emptyMessage="No tracks found for this album."
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
