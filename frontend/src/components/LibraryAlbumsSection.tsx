import { coverPathUrl, coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { AlbumEntry, Playlist, Track } from "../types";
import { useState } from "react";
import { AlbumList } from "./AlbumList";
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
  onBack: () => void;
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
  onBack,
  onTrackSelect,
  playlists,
  onAddTrackToPlaylist
}: LibraryAlbumsSectionProps): JSX.Element {
  const [viewMode, setViewMode] = useState<AlbumViewMode>("list");
  const isListModeTracklistVisible = viewMode === "list" && selectedAlbum !== null;

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
          ) : !isListModeTracklistVisible ? (
            <AlbumList
              albums={albums}
              selectedAlbum={selectedAlbum}
              onAlbumSelect={onAlbumSelect}
              getAlbumCoverSrc={getAlbumCoverSrc}
            />
          ) : null}

          {selectedAlbum ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-flaque-clay/60 bg-white/75">
              <div className="border-b border-flaque-clay/55 px-4 py-3">
                {isListModeTracklistVisible ? (
                  <button
                    className="mb-2 inline-flex items-center rounded-lg border border-flaque-clay/70 bg-flaque-cream/40 px-2.5 py-1 text-xs font-medium text-flaque-steel transition hover:bg-flaque-cream hover:text-flaque-ink"
                    type="button"
                    onClick={onBack}
                  >
                    back
                  </button>
                ) : null}
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
