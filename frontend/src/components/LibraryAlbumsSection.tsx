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
  onPlayAlbum: (album: AlbumEntry) => void;
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
  onPlayAlbum,
  onBack,
  onTrackSelect,
  playlists,
  onAddTrackToPlaylist
}: LibraryAlbumsSectionProps): JSX.Element {
  const [viewMode, setViewMode] = useState<AlbumViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const isListModeTracklistVisible = viewMode === "list" && selectedAlbum !== null;

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredAlbums = normalizedQuery
    ? albums.filter(
        (album) =>
          album.name.toLowerCase().includes(normalizedQuery) ||
          (album.artist && album.artist.toLowerCase().includes(normalizedQuery))
      )
    : albums;

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
    <section className="border border-flaque-clay/60 rounded-xl m-4 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-flaque-ink">Albums</h2>
        </div>

        <div className="flex items-center gap-3">
          {!selectedAlbum && (
            <input
              className="rounded-lg border border-flaque-clay/70 bg-flaque-cream/40 px-3 py-1.5 text-sm text-flaque-ink placeholder:text-flaque-steel/60 focus:border-flaque-ink/40 focus:outline-none"
              type="text"
              placeholder="Search albums..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          )}
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
      </div>

      {libraryMetadataError ? (
        <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{libraryMetadataError}</p>
      ) : null}

      {loadingAlbums ? (
        <p className="mt-3 text-sm text-flaque-steel">Loading albums...</p>
      ) : filteredAlbums.length === 0 ? (
        <p className="mt-3 text-sm text-flaque-steel">No albums found{normalizedQuery ? ` matching "${searchQuery.trim()}"` : " for these filters"}.</p>
      ) : (
        <>
          {viewMode === "coverflow" ? (
            <Coverflow
              albums={filteredAlbums}
              selectedAlbum={selectedAlbum}
              onAlbumSelect={onAlbumSelect}
              getAlbumCoverSrc={getAlbumCoverSrc}
            />
          ) : !isListModeTracklistVisible ? (
            <AlbumList
              albums={filteredAlbums}
              selectedAlbum={selectedAlbum}
              onAlbumSelect={onAlbumSelect}
              onPlayAlbum={onPlayAlbum}
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
                    aria-label="Back"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
                    </svg>
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
                constrainHeight={false}
                showTrackNumber
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
