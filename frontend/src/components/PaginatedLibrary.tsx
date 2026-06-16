import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AlbumEntry, ArtistEntry, Playlist, Track } from "../types";
import type { LibraryFilters } from "../types/library";
import { TrackList } from "./TrackList";

export type PaginatedLibraryProps = {
  // Filter metadata (from existing library response)
  owners: string[];
  ownerNameById?: Record<string, string>;
  artists: ArtistEntry[];
  albums: AlbumEntry[];
  filters: LibraryFilters;
  onFilterChange: (next: LibraryFilters) => void;
  // Paginated tracks (rendering)
  tracks: Track[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  sentinelRef: (node: HTMLDivElement | null) => void;
  // Track interaction
  currentTrackId?: string;
  onTrackSelect: (track: Track) => void;
  onPlayLibrary?: () => void;
  onShuffleLibrary?: () => void;
  playlists?: Playlist[];
  onAddTrackToPlaylist?: (input: { trackId: string; playlistId: string }) => Promise<void> | void;
};

type ActiveChip = {
  key: "owner" | "artist" | "album";
  value: string;
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
  onPlayLibrary,
  onShuffleLibrary,
  playlists,
  onAddTrackToPlaylist
}: PaginatedLibraryProps): JSX.Element {
  const { t } = useTranslation(["library", "common"]);
  const resolveOwnerLabel = (owner: string): string => ownerNameById?.[owner] ?? owner;
  const hasActiveFilters = Boolean(filters.owner || filters.artist || filters.album || filters.q);
  const [searchDraft, setSearchDraft] = useState(filters.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filteredAlbums = useMemo(() => {
    if (!filters.artist) {
      return albums;
    }
    return albums.filter((a) => a.artist === filters.artist);
  }, [albums, filters.artist]);

  const activeChips = useMemo<ActiveChip[]>(() => {
    const chips: ActiveChip[] = [];
    if (filters.owner) {
      chips.push({ key: "owner", value: resolveOwnerLabel(filters.owner) });
    }
    if (filters.artist) {
      chips.push({ key: "artist", value: filters.artist });
    }
    if (filters.album) {
      chips.push({ key: "album", value: filters.album });
    }
    return chips;
    // resolveOwnerLabel closes over ownerNameById, but we list its inputs directly.
  }, [filters.album, filters.artist, filters.owner, ownerNameById]);

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

  function clearChip(key: keyof LibraryFilters): void {
    onFilterChange({ ...filters, [key]: undefined });
  }

  const noTracks = !loading && tracks.length === 0;

  return (
    <section className="p-5">
      {/* Hero header */}
      <div className="rounded-3xl border border-flaque-clay/60 bg-gradient-to-br from-flaque-cream/80 to-white/70 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-3xl text-flaque-ink">{t("library:title")}</h2>
            <p className="mt-1 text-sm text-flaque-steel">
              {loading && total === 0
                ? t("library:loadingShort")
                : hasActiveFilters
                  ? t("library:trackTotalFiltered", { count: total })
                  : t("common:trackCount", { count: total })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-full bg-flaque-ink px-4 py-2 text-sm font-semibold text-flaque-cream shadow-sm transition hover:bg-flaque-ink/90 disabled:cursor-not-allowed disabled:opacity-55"
              type="button"
              onClick={onPlayLibrary}
              disabled={!onPlayLibrary || noTracks}
              title={t("library:playLibrary")}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                <path d="M8 5.14v13.72a1 1 0 0 0 1.55.83l10.4-6.86a1 1 0 0 0 0-1.66l-10.4-6.86A1 1 0 0 0 8 5.14z" />
              </svg>
              {t("library:play")}
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-full border border-flaque-ink/15 bg-white px-4 py-2 text-sm font-semibold text-flaque-ink transition hover:bg-flaque-cream/70 disabled:cursor-not-allowed disabled:opacity-55"
              type="button"
              onClick={onShuffleLibrary}
              disabled={!onShuffleLibrary || noTracks}
              title={t("library:shuffleLibrary")}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M16 3h5v5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 3l-7 7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 21l8-8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M16 21h5v-5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 21l-7-7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 3l5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t("library:shuffle")}
            </button>
          </div>
        </div>

        {/* Search + filters row */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-flaque-steel"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              className="flaque-input rounded-full py-2 pl-9 pr-3 text-sm"
              type="search"
              placeholder={t("library:search")}
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </div>
          <button
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] transition ${
              filtersOpen
                ? "border-flaque-ink bg-flaque-ink text-flaque-cream"
                : "border-flaque-clay bg-white text-flaque-steel hover:bg-flaque-cream/60"
            }`}
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((c) => !c)}
          >
            {t("library:filters")}
            <svg className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 10l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {hasActiveFilters ? (
            <button
              className="rounded-full border border-flaque-clay bg-white px-3 py-2 text-xs text-flaque-steel transition hover:bg-flaque-cream/60 hover:text-flaque-ink"
              type="button"
              onClick={() => {
                setSearchDraft("");
                onFilterChange({});
              }}
            >
              {t("library:clearAll")}
            </button>
          ) : null}
        </div>

        {/* Active filter chips */}
        {activeChips.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1 rounded-full bg-flaque-ink/8 px-3 py-1 text-xs text-flaque-ink"
              >
                <span className="text-flaque-steel">{t(`library:filter.${chip.key}`)}:</span>
                <span className="max-w-[14rem] truncate" title={chip.value}>{chip.value}</span>
                <button
                  className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-flaque-steel transition hover:bg-flaque-ink/15 hover:text-flaque-ink"
                  type="button"
                  aria-label={t("library:removeFilter", { label: t(`library:filter.${chip.key}`) })}
                  onClick={() => clearChip(chip.key)}
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {/* Filter popover (dropdowns) */}
        {filtersOpen ? (
          <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-flaque-clay/55 bg-flaque-cream/45 p-3 md:grid-cols-3">
            <label className="text-xs text-flaque-steel">
              {t("library:filter.owner")}
              <select
                className="flaque-input mt-1 text-sm"
                value={filters.owner ?? ""}
                onChange={(event) =>
                  onFilterChange({ ...filters, owner: event.target.value || undefined })
                }
              >
                <option value="">{t("library:filter.allOwners")}</option>
                {owners.map((owner) => (
                  <option key={owner} value={owner}>
                    {resolveOwnerLabel(owner)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-flaque-steel">
              {t("library:filter.artist")}
              <select
                className="flaque-input mt-1 text-sm"
                value={filters.artist ?? ""}
                onChange={(event) =>
                  onFilterChange({ ...filters, artist: event.target.value || undefined })
                }
              >
                <option value="">{t("library:filter.allArtists")}</option>
                {artists.map((artist) => (
                  <option key={artist.name} value={artist.name}>
                    {artist.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-flaque-steel">
              {t("library:filter.album")}
              <select
                className="flaque-input mt-1 text-sm"
                value={filters.album ?? ""}
                onChange={(event) =>
                  onFilterChange({ ...filters, album: event.target.value || undefined })
                }
              >
                <option value="">{t("library:filter.allAlbums")}</option>
                {filteredAlbums.map((album) => (
                  <option key={`${album.artist ?? "unknown"}-${album.name}`} value={album.name}>
                    {album.artist ? `${album.artist} - ${album.name}` : album.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {/* Track list */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-flaque-clay/55 bg-white/75">
        {loading && tracks.length === 0 ? (
          <p className="px-4 py-6 text-sm text-flaque-steel">{t("library:loading")}</p>
        ) : (
          <TrackList
            tracks={tracks}
            currentTrackId={currentTrackId}
            ownerNameById={ownerNameById}
            onTrackSelect={onTrackSelect}
            playlists={playlists}
            onAddTrackToPlaylist={onAddTrackToPlaylist}
            constrainHeight={false}
            showCover
          />
        )}
      </div>

      <div ref={sentinelRef} className="h-1" />

      {loadingMore ? (
        <p className="mt-3 text-center text-sm text-flaque-steel">{t("library:loadingMore")}</p>
      ) : null}

      {!loading && !loadingMore && !hasMore && tracks.length > 0 ? (
        <p className="mt-3 text-center text-xs text-flaque-steel/70">{t("library:allLoaded")}</p>
      ) : null}
    </section>
  );
}
