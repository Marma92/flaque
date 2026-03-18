import { KeyboardEvent, useMemo } from "react";

import type { AlbumEntry, ArtistEntry, Track } from "../types";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayTitle
} from "../utils/tracks";

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

function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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

  function handleTrackRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, track: Track): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onTrackSelect(track);
  }

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
              onClick={() => onFilterChange({})}
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
                value={filters.q ?? ""}
                onChange={(event) =>
                  onFilterChange({
                    ...filters,
                    q: event.target.value || undefined
                  })
                }
              />
            </label>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-flaque-clay/60 bg-white/85 shadow-panel backdrop-blur-sm">
        <div className="space-y-3 p-4 md:hidden">
          {tracks.map((track) => {
            const selected = track.id === currentTrackId;
            const trackTitle = getTrackDisplayTitle(track);
            const trackArtist = getTrackDisplayArtist(track) ?? "Unknown";
            const trackAlbum = getTrackDisplayAlbumWithYear(track) ?? "Unknown";

            return (
              <button
                key={track.id}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                  selected
                    ? "border-flaque-ink bg-flaque-ink text-flaque-cream"
                    : "border-flaque-clay/60 bg-flaque-cream/45 text-flaque-ink hover:bg-flaque-cream"
                }`}
                type="button"
                onClick={() => onTrackSelect(track)}
              >
                <p className="truncate text-sm font-medium" title={trackTitle}>
                  {trackTitle}
                </p>
                <p className={`mt-1 truncate text-xs ${selected ? "text-flaque-cream/85" : "text-flaque-steel"}`}>
                  {trackArtist}
                </p>
                <p className={`truncate text-xs ${selected ? "text-flaque-cream/75" : "text-flaque-steel/80"}`}>
                  {trackAlbum}
                </p>

                <div
                  className={`mt-2 flex items-center justify-between text-[11px] uppercase tracking-[0.12em] ${
                    selected ? "text-flaque-cream/75" : "text-flaque-steel/85"
                  }`}
                >
                  <span>{resolveOwnerLabel(track.owner)}</span>
                  <span>
                    {formatDuration(track.duration)} - {track.codec}
                  </span>
                </div>
              </button>
            );
          })}

          {tracks.length === 0 ? <p className="text-sm text-flaque-steel">No tracks match this filter yet.</p> : null}
        </div>

        <div className="hidden max-h-[50vh] overflow-auto md:block">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Artist</th>
                <th className="px-4 py-3 font-medium">Album</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Codec</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => {
                const selected = track.id === currentTrackId;
                const trackTitle = getTrackDisplayTitle(track);
                const trackArtist = getTrackDisplayArtist(track) ?? "Unknown";
                const trackAlbum = getTrackDisplayAlbumWithYear(track) ?? "Unknown";
                return (
                  <tr
                    key={track.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Play ${trackTitle}`}
                    className={`cursor-pointer border-t border-flaque-clay/40 transition ${
                      selected ? "bg-flaque-sand/20" : "hover:bg-flaque-cream/60"
                    }`}
                    onClick={() => onTrackSelect(track)}
                    onKeyDown={(event) => handleTrackRowKeyDown(event, track)}
                  >
                    <td className="px-4 py-3 text-flaque-ink">
                      <span className="block max-w-[24rem] truncate" title={trackTitle}>
                        {trackTitle}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-flaque-steel">{trackArtist}</td>
                    <td className="px-4 py-3 text-flaque-steel">{trackAlbum}</td>
                    <td className="px-4 py-3 text-flaque-steel">{resolveOwnerLabel(track.owner)}</td>
                    <td className="px-4 py-3 text-flaque-steel">{formatDuration(track.duration)}</td>
                    <td className="px-4 py-3 uppercase text-flaque-steel">{track.codec}</td>
                  </tr>
                );
              })}
              {tracks.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-flaque-steel" colSpan={6}>
                    No tracks match this filter yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
