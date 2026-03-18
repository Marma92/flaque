import { useEffect, useMemo, useState } from "react";

import type { AlbumEntry, ArtistEntry, Track } from "../types";
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
  onOpenUpload: () => void;
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
  onOpenUpload
}: LibraryViewProps): JSX.Element {
  const resolveOwnerLabel = (owner: string): string => ownerNameById?.[owner] ?? owner;
  const hasActiveFilters = Boolean(filters.owner || filters.artist || filters.album || filters.q);
  const [searchDraft, setSearchDraft] = useState(filters.q ?? "");

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
      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-flaque-ink">Library</h2>
            <p className="text-sm text-flaque-steel">Latest index rebuild: {generatedAtLabel}</p>
          </div>

          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream"
            type="button"
            onClick={onOpenUpload}
          >
            Open Upload page
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-flaque-clay/55 bg-flaque-cream/45 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-flaque-steel">Filters</p>
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

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="search"
                placeholder="Search title, artist, album, year"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-flaque-clay/60 bg-white/85 shadow-panel backdrop-blur-sm">
        <TrackList
          tracks={tracks}
          currentTrackId={currentTrackId}
          ownerNameById={ownerNameById}
          onTrackSelect={onTrackSelect}
        />
      </section>
    </div>
  );
}
