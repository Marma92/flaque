import type { AlbumEntry, Playlist, Track } from "../types";
import { defaultCoverImage, getAlbumCoverSrc } from "../utils/covers";
import { formatDurationHuman } from "../utils/format";
import {
  type AlbumSortMode,
  DEFAULT_ALBUM_SORT_MODE,
  isAlbumSortMode,
  sortAlbums,
  sortAndGroupAlbums
} from "../utils/albumSort";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlbumList } from "./AlbumList";
import { Coverflow } from "./Coverflow";
import { SectionLabel } from "./SectionLabel";
import { TrackList } from "./TrackList";

const ALBUM_SORT_STORAGE_KEY = "flaque.albums.sort";

const ALBUM_SORT_OPTIONS: ReadonlyArray<{ value: AlbumSortMode; label: string }> = [
  { value: "album-asc", label: "Album A → Z" },
  { value: "album-desc", label: "Album Z → A" },
  { value: "artist-asc", label: "Artist A → Z" },
  { value: "artist-desc", label: "Artist Z → A" },
  { value: "year-desc", label: "Year (newest)" },
  { value: "year-asc", label: "Year (oldest)" }
];

function loadInitialSortMode(): AlbumSortMode {
  if (typeof window === "undefined") return DEFAULT_ALBUM_SORT_MODE;
  try {
    const stored = window.localStorage.getItem(ALBUM_SORT_STORAGE_KEY);
    if (isAlbumSortMode(stored)) return stored;
  } catch {
    // localStorage may be unavailable (private mode, etc.)
  }
  return DEFAULT_ALBUM_SORT_MODE;
}

export type LibraryAlbumsSectionProps = {
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
  const [sortMode, setSortMode] = useState<AlbumSortMode>(loadInitialSortMode);
  const isAlbumSelected = selectedAlbum !== null;
  const lastSelectedAlbumRef = useRef<AlbumEntry | null>(null);
  if (selectedAlbum && viewMode === "coverflow") {
    lastSelectedAlbumRef.current = selectedAlbum;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ALBUM_SORT_STORAGE_KEY, sortMode);
    } catch {
      // ignore
    }
  }, [sortMode]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredAlbums = normalizedQuery
    ? albums.filter(
        (album) =>
          album.name.toLowerCase().includes(normalizedQuery) ||
          (album.artist && album.artist.toLowerCase().includes(normalizedQuery))
      )
    : albums;

  const sortedAlbums = useMemo(() => sortAlbums(filteredAlbums, sortMode), [filteredAlbums, sortMode]);
  const groupedAlbums = useMemo(() => sortAndGroupAlbums(filteredAlbums, sortMode), [filteredAlbums, sortMode]);

  const albumCoverSrc = selectedAlbum ? getAlbumCoverSrc(selectedAlbum) : defaultCoverImage;

  return (
    <>
      {/* Album header — transparent, above the main section */}
      {isAlbumSelected && (
        <div className="mx-4 mt-4 px-4 py-6">
          <div className="flex items-center gap-6">
            <img
              className="h-36 w-36 shrink-0 object-cover shadow-md"
              src={albumCoverSrc}
              alt={selectedAlbum.name}
              onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
            />
            <div className="min-w-0">
              <h3 className="truncate font-display text-4xl font-bold text-flaque-ink">{selectedAlbum.name}</h3>
              <p className="mt-1 text-base text-flaque-steel">
                {selectedAlbum.artist ?? "Unknown artist"}
              </p>
              <p className="mt-0.5 text-sm text-flaque-steel">
                {selectedAlbum.year ? `${selectedAlbum.year} · ` : ""}
                {selectedAlbum.trackCount} track{selectedAlbum.trackCount !== 1 ? "s" : ""}
                {selectedAlbum.totalDuration ? ` · ${formatDurationHuman(selectedAlbum.totalDuration)}` : ""}
              </p>
            </div>
          </div>
        </div>
      )}

    <section className={`border border-flaque-clay/60 rounded-xl m-4 bg-white/85 p-5 shadow-panel backdrop-blur-sm${!isAlbumSelected && viewMode === "coverflow" ? " flex flex-1 flex-col" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {isAlbumSelected ? (
          <button
            className="mb-3 inline-flex items-center rounded-lg border border-flaque-clay/70 bg-flaque-cream/40 px-2.5 py-1 text-xs font-medium text-flaque-steel transition hover:bg-flaque-cream hover:text-flaque-ink"
            type="button"
            onClick={onBack}
            aria-label="Back"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
        ) : (
          <>
            <h2 className="font-display text-xl text-flaque-ink">Albums</h2>
            <div className="flex flex-wrap items-center gap-3">
              <input
                className="rounded-lg border border-flaque-clay/70 bg-flaque-cream/40 px-3 py-1.5 text-sm text-flaque-ink placeholder:text-flaque-steel/60 focus:border-flaque-ink/40 focus:outline-none"
                type="text"
                placeholder="Search albums..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <label className="sr-only" htmlFor="album-sort">Sort albums</label>
              <select
                id="album-sort"
                className="rounded-lg border border-flaque-clay/70 bg-flaque-cream/40 px-3 py-1.5 text-sm text-flaque-ink focus:border-flaque-ink/40 focus:outline-none"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as AlbumSortMode)}
                aria-label="Sort albums"
              >
                {ALBUM_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
          </>
        )}
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
          {!isAlbumSelected && viewMode === "coverflow" ? (
            <div className="flex flex-1 items-center">
              <Coverflow
                albums={sortedAlbums}
                selectedAlbum={lastSelectedAlbumRef.current}
                onAlbumSelect={onAlbumSelect}
              />
            </div>
          ) : !isAlbumSelected && viewMode === "list" ? (
            <div className="mt-3">
              {groupedAlbums.map((group, idx) => (
                <div key={group.key}>
                  <SectionLabel label={group.label} />
                  <AlbumList
                    albums={group.albums}
                    selectedAlbum={selectedAlbum}
                    onAlbumSelect={onAlbumSelect}
                    onPlayAlbum={onPlayAlbum}
                  />
                  {idx < groupedAlbums.length - 1 && <div className="mb-4" />}
                </div>
              ))}
            </div>
          ) : null}

          {isAlbumSelected ? (
            <div className="overflow-hidden rounded-2xl border border-flaque-clay/60 bg-white/75">
              {loadingSelectedAlbumTracks ? (
                <p className="px-4 py-3 text-xs text-flaque-steel">Loading album tracks...</p>
              ) : null}
              {selectedAlbumTracksError ? (
                <p className="px-4 py-3 text-xs text-red-700">{selectedAlbumTracksError}</p>
              ) : null}

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
    </>
  );
}
