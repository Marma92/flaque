import { useEffect, useMemo, useState } from "react";

import type { AlbumEntry, ArtistEntry, Playlist, Track } from "../types";
import type { LibraryFilters } from "../types/library";
import { TrackList } from "./TrackList";

type PaginatedLibraryProps = {
  // Filter metadata (from existing library response)
  owners: string[];
  ownerNameById?: Record<string, string>;
  artists: ArtistEntry[];
  albums: AlbumEntry[];
  filters: LibraryFilters;
  onFilterChange: (next: LibraryFilters) => void;
  // Paginated tracks
  tracks: Track[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  sentinelRef: (node: HTMLDivElement | null) => void;
  // Track interaction
  currentTrackId?: string;
  onTrackSelect: (track: Track) => void;
  playlists?: Playlist[];
  onAddTrackToPlaylist?: (input: { trackId: string; playlistId: string }) => Promise<void> | void;
};

export function PaginatedLibrary({
  owners,
  ownerNameById,
  artists,
  albums,
  filters,
  onFilterChange,
  tracks,
  total,
  loading,
  loadingMore,
  hasMore,
  sentinelRef,
  currentTrackId,
  onTrackSelect,
  playlists,
  onAddTrackToPlaylist
}: PaginatedLibraryProps): JSX.Element {
  const resolveOwnerLabel = (owner: string): string => ownerNameById?.[owner] ?? owner;
  const hasActiveFilters = Boolean(filters.owner || filters.artist || filters.album || filters.q);
  const [searchDraft, setSearchDraft] = useState(filters.q ?? "");
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const filteredAlbums = useMemo(() => {
    if (!filters.artist) {
      return albums;
    }
    return albums.filter((a) => a.artist === filters.artist);
  }, [albums, filters.artist]);

  useEffect(() => {
    setSearchDraft(filters.q ?? "");
  }, [filters.q]);

  useEffect(() => {
    const trimmedDraft = searchDraft.trim();
    const currentQuery = (filters.q ?? "").trim();
    if (trimmedDraft === currentQuery) {
      return;
    }

    const timer = window.setTimeout(() => {
      onFilterChange({
        ...filters,
        q: trimmedDraft || undefined
      });
    }, 260);

    return () => {
      window.clearTimeout(timer);
    };
  }, [filters, onFilterChange, searchDraft]);

  return (
    <section className="p-5">

      <div className="mt-4 rounded-t-xl border border-flaque-clay/55 bg-flaque-cream/45 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-flaque-steel">
            Library
            {!loading && total > 0 ? (
              <span className="ml-2">({total} tracks)</span>
            ) : null}
            {!filtersExpanded && hasActiveFilters ? (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-flaque-ink/50" />
            ) : null}
          </p>
          <button
            className="flex items-center text-xs font-medium uppercase tracking-[0.14em] rounded-lg text-flaque-steel transition hover:bg-flaque-cream/70 hover:text-flaque-ink"
            type="button"
            aria-label={filtersExpanded ? "Collapse filters" : "Expand filters"}
            onClick={() => setFiltersExpanded((c) => !c)}
          >
            Filters
            <svg className={`h-4 w-4 transition-transform ${filtersExpanded ? "" : "-rotate-90"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 10l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {filtersExpanded ? (
          <>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="text-xs text-flaque-steel">
                Owner
                <select
                  className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  value={filters.owner ?? ""}
                  onChange={(event) =>
                    onFilterChange({
                      ...filters,
                      owner: event.target.value || undefined
                    })
                  }
                >
                  <option value="">All owners</option>
                  {owners.map((owner) => (
                    <option key={owner} value={owner}>
                      {resolveOwnerLabel(owner)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-flaque-steel">
                Artist
                <select
                  className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  value={filters.artist ?? ""}
                  onChange={(event) =>
                    onFilterChange({
                      ...filters,
                      artist: event.target.value || undefined
                    })
                  }
                >
                  <option value="">All artists</option>
                  {artists.map((artist) => (
                    <option key={artist.name} value={artist.name}>
                      {artist.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-flaque-steel">
                Album
                <select
                  className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  value={filters.album ?? ""}
                  onChange={(event) =>
                    onFilterChange({
                      ...filters,
                      album: event.target.value || undefined
                    })
                  }
                >
                  <option value="">All albums</option>
                  {filteredAlbums.map((album) => (
                    <option key={`${album.artist ?? "unknown"}-${album.name}`} value={album.name}>
                      {album.artist ? `${album.artist} - ${album.name}` : album.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-flaque-steel">
                Search
                <input
                  className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  type="search"
                  placeholder="Search title, artist, album, year"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                className="rounded-lg border border-flaque-clay bg-white px-2.5 py-1 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-55"
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  onFilterChange({});
                }}
                disabled={!hasActiveFilters}
              >
                Reset filters
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-b-2xl border border-flaque-clay/55 bg-white/75">
        {loading && tracks.length === 0 ? (
          <p className="px-4 py-6 text-sm text-flaque-steel">Loading library...</p>
        ) : (
          <TrackList
            tracks={tracks}
            currentTrackId={currentTrackId}
            ownerNameById={ownerNameById}
            onTrackSelect={onTrackSelect}
            playlists={playlists}
            onAddTrackToPlaylist={onAddTrackToPlaylist}
            constrainHeight={false}
          />
        )}
      </div>

      <div ref={sentinelRef} className="h-1" />

      {loadingMore ? (
        <p className="mt-3 text-center text-sm text-flaque-steel">Loading more tracks...</p>
      ) : null}

      {!loading && !loadingMore && !hasMore && tracks.length > 0 ? (
        <p className="mt-3 text-center text-xs text-flaque-steel/70">All tracks loaded</p>
      ) : null}
    </section>
  );
}
