import { coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { RecentUploadAlbum, RecentUploadItem } from "../api";
import type { Track } from "../types";
import type { UploadPeriod } from "../hooks/useRecentlyUploaded";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayTitle
} from "../utils/tracks";

type RecentlyUploadedPanelProps = {
  items: RecentUploadItem[];
  loading: boolean;
  period: UploadPeriod;
  onPeriodChange: (period: UploadPeriod) => void;
  onTrackSelect: (track: Track) => void;
  onAlbumPlay: (album: RecentUploadAlbum) => void;
  onAlbumOpen: (album: RecentUploadAlbum) => void;
  ownerNameById?: Record<string, string>;
};

const periodOptions: { value: UploadPeriod; label: string; shortLabel: string }[] = [
  { value: "7d", label: "7 days", shortLabel: "7d" },
  { value: "30d", label: "30 days", shortLabel: "30d" }
];

const GRID_CLASS =
  "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6";

// ── Album card (vinyl) ────────────────────────────────────────────

function VinylAlbumCard({
  album,
  onPlay,
  onOpen,
  ownerLabel
}: {
  album: RecentUploadAlbum;
  onPlay: (album: RecentUploadAlbum) => void;
  onOpen: (album: RecentUploadAlbum) => void;
  ownerLabel?: string;
}): JSX.Element {
  return (
    <div className="group w-full overflow-hidden rounded-xl border border-flaque-clay/60 bg-flaque-cream/60 text-left shadow-sm transition hover:shadow-md">
      <button
        type="button"
        className="relative block aspect-square w-full overflow-hidden cursor-pointer"
        onClick={() => onPlay(album)}
        title={`Play ${album.albumName}`}
        aria-label={`Play ${album.albumName}`}
      >
        {/* Vinyl disc */}
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-neutral-800 via-neutral-900 to-black shadow-md transition-transform duration-700 ease-out group-hover:rotate-[20deg]">
          {/* Grooves */}
          <div className="absolute inset-[4%] rounded-full border border-white/[0.04]" />
          <div className="absolute inset-[11%] rounded-full border border-white/[0.05]" />
          <div className="absolute inset-[18%] rounded-full border border-white/[0.06]" />
          {/* Label (album cover clipped to circle) */}
          <div className="absolute inset-[22%] overflow-hidden rounded-full border border-black/60 shadow-inner">
            <img
              className="h-full w-full object-cover"
              src={coverUrl(album.coverTrackId)}
              alt={`Cover for ${album.albumName}`}
              onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
            />
            {/* Center spindle hole */}
            <div className="absolute left-1/2 top-1/2 h-[14%] w-[14%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black ring-1 ring-white/10" />
          </div>
        </div>
        {/* Round play overlay (covers the disc only) */}
        <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
          <svg className="h-7 w-7 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
            <path d="M8 6v12l10-6-10-6z" />
          </svg>
        </div>
        {/* Track count badge */}
        <span className="absolute bottom-1 right-1 rounded-md bg-indigo-700/85 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          {album.trackCount}
        </span>
      </button>
      <button
        type="button"
        className="block w-full cursor-pointer px-2 py-1.5 text-left transition hover:bg-flaque-cream"
        onClick={() => onOpen(album)}
        title={`Open ${album.albumName}`}
      >
        <p className="truncate text-[11px] font-semibold text-flaque-ink">{album.albumName}</p>
        <p className="truncate text-[10px] text-flaque-steel">{album.artist}</p>
        {ownerLabel ? (
          <p className="truncate text-[10px] text-flaque-steel/50">{ownerLabel}</p>
        ) : null}
      </button>
    </div>
  );
}

// ── Track card ────────────────────────────────────────────────────

function TrackCard({
  track,
  onSelect,
  ownerLabel
}: {
  track: Track;
  onSelect: (track: Track) => void;
  ownerLabel?: string;
}): JSX.Element {
  const title = getTrackDisplayTitle(track);
  const artist = getTrackDisplayArtist(track) ?? "Unknown artist";
  const albumWithYear = getTrackDisplayAlbumWithYear(track);

  return (
    <button
      type="button"
      className="group w-full overflow-hidden rounded-xl border border-flaque-clay/60 bg-white/85 text-left shadow-sm transition hover:shadow-md"
      onClick={() => onSelect(track)}
      title={title}
    >
      <div className="relative aspect-square w-full overflow-hidden">
        <img
          className="h-full w-full object-cover"
          src={coverUrl(track.id, track.cover)}
          alt={albumWithYear ? `Cover for ${albumWithYear}` : `Cover for ${title}`}
          onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
          <svg className="h-7 w-7 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
            <path d="M8 6v12l10-6-10-6z" />
          </svg>
        </div>
      </div>
      <div className="bg-flaque-cream/60 px-2 py-1.5">
        <p className="truncate text-[11px] font-semibold text-flaque-ink">{title}</p>
        <p className="truncate text-[10px] text-flaque-steel">{artist}</p>
        {albumWithYear ? (
          <p className="truncate text-[10px] text-flaque-steel/70">{albumWithYear}</p>
        ) : null}
        {ownerLabel ? (
          <p className="truncate text-[10px] text-flaque-steel/50">{ownerLabel}</p>
        ) : null}
      </div>
    </button>
  );
}

// ── Panel ─────────────────────────────────────────────────────────

export function RecentlyUploadedPanel({
  items,
  loading,
  period,
  onPeriodChange,
  onTrackSelect,
  onAlbumPlay,
  onAlbumOpen,
  ownerNameById
}: RecentlyUploadedPanelProps): JSX.Element | null {
  if (!loading && items.length === 0) {
    return null;
  }

  const resolveOwner = (owner: string): string => ownerNameById?.[owner] ?? owner;

  return (
    <section className="border border-flaque-clay/60 rounded-xl bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="shrink-0 font-display text-xl text-flaque-ink">Recent Uploads</h2>
        <div className="flex gap-1">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                period === option.value
                  ? "bg-flaque-ink text-white"
                  : "border border-flaque-clay bg-white text-flaque-steel hover:bg-flaque-cream"
              }`}
              type="button"
              onClick={() => onPeriodChange(option.value)}
            >
              <span className="md:hidden">{option.shortLabel}</span>
              <span className="hidden md:inline">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <p className="mt-3 text-sm text-flaque-steel">Loading...</p>
      ) : (
        <div className={`mt-3 grid gap-2 ${GRID_CLASS}`}>
          {items.map((item) =>
            item.kind === "album" ? (
              <VinylAlbumCard
                key={`album:${item.album.albumName}:${item.album.owner}`}
                album={item.album}
                onPlay={onAlbumPlay}
                onOpen={onAlbumOpen}
                ownerLabel={ownerNameById ? resolveOwner(item.album.owner) : undefined}
              />
            ) : (
              <TrackCard
                key={item.track.id}
                track={item.track}
                onSelect={onTrackSelect}
                ownerLabel={ownerNameById ? resolveOwner(item.track.owner) : undefined}
              />
            )
          )}
        </div>
      )}
    </section>
  );
}
