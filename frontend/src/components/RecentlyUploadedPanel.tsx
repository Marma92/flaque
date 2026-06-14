import { useTranslation } from "react-i18next";

import { coverUrl } from "../api";
import defaultCoverImage from "../assets/default-cover.png";
import type { RecentUploadAlbum, RecentUploadItem } from "../api";
import type { Track } from "../types";
import type { UploadPeriod } from "../hooks/useRecentlyUploaded";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayTitle,
  getTrackDisplayYear
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

const periodOptions: UploadPeriod[] = ["7d", "30d"];

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
  const { t } = useTranslation("home");
  const year = album.tracks
    .map((track) => getTrackDisplayYear(track))
    .find((value): value is string => Boolean(value));
  const albumLabel = year ? `${album.albumName} (${year})` : album.albumName;
  return (
    <div className="group relative flex w-full flex-col overflow-hidden rounded-xl text-left shadow-sm transition hover:shadow-md">
      <button
        type="button"
        className="relative block aspect-square w-full cursor-pointer overflow-hidden bg-flaque-cream"
        onClick={() => onPlay(album)}
        title={t("albumPlay", { album: album.albumName })}
        aria-label={t("albumPlay", { album: album.albumName })}
        style={{
          WebkitMaskImage:
            "radial-gradient(circle at 50% 50%, transparent 4%, black 4.5%)",
          maskImage:
            "radial-gradient(circle at 50% 50%, transparent 4%, black 4.5%)"
        }}
      >
        {/* Vinyl disc */}
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-neutral-800 via-neutral-900 to-black shadow-md transition-transform duration-700 ease-out group-hover:rotate-[20deg]">
          {/* Grooves */}
          <div className="absolute inset-[4%] rounded-full border border-white/[0.04]" />
          <div className="absolute inset-[11%] rounded-full border border-white/[0.05]" />
          <div className="absolute inset-[18%] rounded-full border border-white/[0.06]" />
          {/* Label (album cover clipped to circle) */}
          <div className="absolute inset-[22%] overflow-hidden rounded-full border border-flaque-cream shadow-inner">
            <img
              className="h-full w-full object-cover"
              src={coverUrl(album.coverTrackId)}
              alt={t("albumCoverAlt", { album: album.albumName })}
              onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
            />
          </div>
        </div>
        {/* Track count badge */}
        <span className="absolute bottom-1 right-1 rounded-md bg-flaque-ink/85 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          {t("albumTrackBadge", { count: album.trackCount })}
        </span>
      </button>
      <div
        role="button"
        tabIndex={0}
        className="w-full flex-1 cursor-pointer bg-flaque-cream px-2 py-1.5 text-left"
        onClick={() => onOpen(album)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(album);
          }
        }}
        title={t("albumOpen", { album: album.albumName })}
      >
        <p className="truncate text-[11px] font-semibold text-flaque-ink">{albumLabel}</p>
        <p className="truncate text-[10px] text-flaque-steel">{album.artist}</p>
        {ownerLabel ? (
          <p className="truncate text-[10px] text-flaque-steel/50">{ownerLabel}</p>
        ) : null}
      </div>
      {/* Round play overlay (sibling, so the vinyl mask doesn't hide it) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
        <div className="absolute inset-2 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
          <svg className="h-7 w-7 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
            <path d="M8 6v12l10-6-10-6z" />
          </svg>
        </div>
      </div>
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
  const { t } = useTranslation(["library", "common"]);
  const title = getTrackDisplayTitle(track);
  const artist = getTrackDisplayArtist(track) ?? t("common:unknownArtist");
  const albumWithYear = getTrackDisplayAlbumWithYear(track);

  return (
    <button
      type="button"
      className="group flex w-full flex-col overflow-hidden rounded-xl bg-white/85 text-left shadow-sm transition hover:shadow-md"
      onClick={() => onSelect(track)}
      title={title}
    >
      <div className="relative aspect-square w-full overflow-hidden">
        <img
          className="h-full w-full object-cover"
          src={coverUrl(track.id, track.cover)}
          alt={t("library:track.coverAlt", { name: albumWithYear ?? title })}
          onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
          <svg className="h-7 w-7 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
            <path d="M8 6v12l10-6-10-6z" />
          </svg>
        </div>
      </div>
      <div className="flex-1 bg-flaque-cream px-2 py-1.5">
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
  const { t } = useTranslation("home");

  if (!loading && items.length === 0) {
    return null;
  }

  const resolveOwner = (owner: string): string => ownerNameById?.[owner] ?? owner;

  return (
    <section className="border border-flaque-clay/60 rounded-xl bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="shrink-0 font-display text-xl text-flaque-ink">{t("recentUploads")}</h2>
        <div className="flex gap-1">
          {periodOptions.map((option) => (
            <button
              key={option}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                period === option
                  ? "bg-flaque-ink text-white"
                  : "border border-flaque-clay bg-white text-flaque-steel hover:bg-flaque-cream"
              }`}
              type="button"
              onClick={() => onPeriodChange(option)}
            >
              <span className="md:hidden">{t(`period.${option}Short`)}</span>
              <span className="hidden md:inline">{t(`period.${option}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <p className="mt-3 text-sm text-flaque-steel">{t("loading")}</p>
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
