import { useEffect, useMemo, useState } from "react";

import type { AlbumEntry, ArtistEntry, Playlist, Track } from "../types";
import { TrackList } from "./TrackList";

type LibraryFilter = {
  owner?: string;
  artist?: string;
  album?: string;
  q?: string;
};

type LibraryViewProps = {
  generatedAt: string;
  tracks: Track[];
  owners: string[];
  ownerNameById?: Record<string, string>;
  artists: ArtistEntry[];
  albums: AlbumEntry[];
  filters: LibraryFilter;
  onFilterChange: (next: LibraryFilter) => void;
  currentTrackId?: string;
  onTrackSelect: (track: Track) => void;
  playlists?: Playlist[];
  onAddTrackToPlaylist?: (input: { trackId: string; playlistId: string }) => Promise<void> | void;
};

export function LibraryView({
  generatedAt,
  tracks,
  owners,
  ownerNameById,
  artists,
  albums,
  filters,
  onFilterChange,
  currentTrackId,
  onTrackSelect,
  playlists,
  onAddTrackToPlaylist
}: LibraryViewProps): JSX.Element {
  const resolveOwnerLabel = (owner: string): string => ownerNameById?.[owner] ?? owner;
  const hasActiveFilters = Boolean(filters.owner || filters.artist || filters.album || filters.q);
  const [searchDraft, setSearchDraft] = useState(filters.q ?? "");
  const [filtersExpanded, setFiltersExpanded] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches);

  const generatedAtLabel = useMemo(() => {
    if (!generatedAt) {
      return "never";
    }
    try {
      return new Date(generatedAt).toLocaleString();
    } catch {
      return generatedAt;
    }
  }, [generatedAt]);

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
    <div className="space-y-4">
      <section className="flaque-panel rounded-3xl p-5">
        <div>
          <div>
            <h2 className="font-display text-2xl text-flaque-ink">Library</h2>
            <p className="text-sm text-flaque-steel">Latest index rebuild: {generatedAtLabel}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-flaque-clay/55 bg-flaque-cream/45 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-flaque-steel">
              Filters
              {!filtersExpanded && hasActiveFilters ? (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-flaque-ink/50" />
              ) : null}
            </p>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg text-flaque-steel transition hover:bg-flaque-cream/70 hover:text-flaque-ink"
              type="button"
              aria-label={filtersExpanded ? "Collapse filters" : "Expand filters"}
              onClick={() => setFiltersExpanded((c) => !c)}
            >
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
                    className="flaque-input mt-1 text-sm"
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
                    className="flaque-input mt-1 text-sm"
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
                    className="flaque-input mt-1 text-sm"
                    value={filters.album ?? ""}
                    onChange={(event) =>
                      onFilterChange({
                        ...filters,
                        album: event.target.value || undefined
                      })
                    }
                  >
                    <option value="">All albums</option>
                    {albums.map((album) => (
                      <option key={`${album.artist ?? "unknown"}-${album.name}`} value={album.name}>
                        {album.artist ? `${album.artist} - ${album.name}` : album.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-flaque-steel">
                  Search
                  <input
                    className="flaque-input mt-1 text-sm"
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
        <div className="mt-4 overflow-hidden rounded-2xl border border-flaque-clay/55 bg-white/75">
          <TrackList
            tracks={tracks}
            currentTrackId={currentTrackId}
            ownerNameById={ownerNameById}
            onTrackSelect={onTrackSelect}
            playlists={playlists}
            onAddTrackToPlaylist={onAddTrackToPlaylist}
          />
        </div>
      </section>
    </div>
  );
}
