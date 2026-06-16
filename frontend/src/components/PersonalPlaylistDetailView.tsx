import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { coverPathUrl, getPersonalPlaylistDetail } from "../api";
import { usePlaylistDetailPlayback } from "../hooks/usePlaylistDetailPlayback";
import type { PersonalPlaylistDetail, Playlist, Track } from "../types";
import { activeLocale, formatDurationCompact } from "../utils/format";
import { personalPlaylistDescription, personalPlaylistName } from "../utils/generatedPlaylists";
import { PlaylistTrackList } from "./PlaylistTrackList";

export type PersonalPlaylistDetailViewProps = {
  playlistId: string;
  allTracksById: Map<string, Track>;
  onBack: () => void;
  onPlayTrack: (playlist: Playlist, options?: { shuffle?: boolean }) => void;
};

export function PersonalPlaylistDetailView({
  playlistId,
  allTracksById,
  onBack,
  onPlayTrack
}: PersonalPlaylistDetailViewProps): JSX.Element {
  const { t } = useTranslation(["playlists", "common"]);
  const [detail, setDetail] = useState<PersonalPlaylistDetail | null>(null);
  const [detailTracks, setDetailTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPersonalPlaylistDetail(playlistId)
      .then((result) => {
        setDetail(result.playlist);
        setDetailTracks(result.tracks);
      })
      .catch(() => {
        setDetail(null);
        setDetailTracks([]);
      })
      .finally(() => setLoading(false));
  }, [playlistId]);

  const tracks = useMemo(() => {
    if (!detail) return detailTracks;
    return detail.trackIds
      .map((id) => detailTracks.find((t) => t.id === id) ?? allTracksById.get(id))
      .filter((t): t is Track => t !== undefined);
  }, [detail, detailTracks, allTracksById]);

  const totalDuration = useMemo(() => tracks.reduce((sum, t) => sum + t.duration, 0), [tracks]);

  const syntheticPlaylist = useMemo<Playlist | null>(() => {
    if (!detail) return null;
    return {
      id: detail.id,
      name: detail.name,
      authorId: "system",
      visibility: "public",
      trackIds: tracks.map((t) => t.id),
      description: detail.description,
      cover: null,
      hearts: [],
      heartCount: 0,
      listenCount: 0,
      collaborators: []
    };
  }, [detail, tracks]);

  const { handlePlayAll, handleShufflePlay, handlePlayFromTrack } = usePlaylistDetailPlayback({
    playlist: syntheticPlaylist,
    tracks,
    onPlay: onPlayTrack
  });

  if (loading) {
    return (
      <section className="m-4 flaque-panel p-5">
        <BackButton onClick={onBack} />
        <p className="text-sm text-flaque-steel">{t("playlists:loading")}</p>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="m-4 flaque-panel p-5">
        <BackButton onClick={onBack} />
        <p className="text-sm text-flaque-steel">{t("playlists:personalNotFound")}</p>
      </section>
    );
  }

  const [c1, c2, c3] = detail.colors ?? ["hsl(220, 60%, 50%)", "hsl(260, 60%, 50%)", "hsl(340, 60%, 50%)"];
  const angle = detail.gradientAngle ?? 135;
  const gradientStyle = { background: `linear-gradient(${angle}deg, ${c1}, ${c2}, ${c3})` };
  const mosaic = detail.mosaicCovers ?? [];

  return (
    <section className="m-4 space-y-4">
      <BackButton onClick={onBack} />

      <div className="rounded-2xl p-5">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="group relative h-48 w-48 shrink-0 self-center overflow-hidden rounded-2xl sm:self-start" style={gradientStyle}>
            {mosaic.length > 0 ? (
              <div
                className={`absolute inset-0 grid ${mosaic.length === 1 ? "grid-cols-1" : "grid-cols-2"} ${mosaic.length <= 2 ? "grid-rows-1" : "grid-rows-2"}`}
              >
                {mosaic.slice(0, 4).map((cover, i) => (
                  <img
                    key={`${detail.id}-cover-${i}`}
                    src={coverPathUrl(cover)}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            ) : null}
            <div className="absolute inset-0 bg-black/30" />
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"
              onClick={handlePlayAll}
              aria-label={t("playlists:play", { name: detail.name })}
            >
              <svg className="h-12 w-12 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                <path d="M8 6v12l10-6-10-6z" />
              </svg>
            </button>
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="font-display text-2xl text-flaque-ink">{personalPlaylistName(t, detail.variant)}</h2>
            <p className="mt-1 text-sm text-flaque-steel">{personalPlaylistDescription(t, detail.variant)}</p>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-flaque-steel">
              <span className="rounded-full bg-flaque-sand/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-flaque-ink/70">
                {t("playlists:personalMix")}
              </span>
              <span>{t("common:trackCount", { count: detail.trackCount })}</span>
              {totalDuration > 0 ? <span>{formatDurationCompact(totalDuration)}</span> : null}
              <span>{t("playlists:generated", { date: new Date(detail.generatedAt).toLocaleDateString(activeLocale()) })}</span>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black"
                onClick={handlePlayAll}
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Play all
              </button>

              <button
                type="button"
                className="flex items-center gap-1.5 rounded-xl border border-flaque-clay px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream"
                onClick={handleShufflePlay}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M16 3h5v5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 20l8-8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M21 3l-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 4l6 6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M15 16l2 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Shuffle
              </button>
            </div>
          </div>
        </div>
      </div>

      <PlaylistTrackList tracks={tracks} onTrackPlay={handlePlayFromTrack} />
    </section>
  );
}

function BackButton({ onClick }: { onClick: () => void }): JSX.Element {
  const { t } = useTranslation("playlists");
  return (
    <button
      type="button"
      className="mb-4 flex items-center gap-1 text-sm text-flaque-steel transition hover:text-flaque-ink"
      onClick={onClick}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {t("backToPlaylists")}
    </button>
  );
}
