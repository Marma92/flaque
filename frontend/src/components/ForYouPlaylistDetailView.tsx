import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { coverPathUrl, getForYouPlaylistDetail } from "../api";
import { usePlaylistDetailPlayback } from "../hooks/usePlaylistDetailPlayback";
import type { ForYouPlaylistDetail, Playlist, Track } from "../types";
import { activeLocale, formatDurationCompact } from "../utils/format";
import { forYouPlaylistName } from "../utils/generatedPlaylists";
import { PlaylistTrackList } from "./PlaylistTrackList";

export type ForYouPlaylistDetailViewProps = {
  playlistId: string;
  allTracksById: Map<string, Track>;
  onBack: () => void;
  onPlayTrack: (playlist: Playlist, options?: { shuffle?: boolean }) => void;
  onDismiss: (playlistId: string) => Promise<void>;
};

export function ForYouPlaylistDetailView({
  playlistId,
  allTracksById,
  onBack,
  onPlayTrack,
  onDismiss
}: ForYouPlaylistDetailViewProps): JSX.Element {
  const { t } = useTranslation(["playlists", "common"]);
  const [detail, setDetail] = useState<ForYouPlaylistDetail | null>(null);
  const [detailTracks, setDetailTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    setLoading(true);
    getForYouPlaylistDetail(playlistId)
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
      description: "",
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

  async function handleDismiss(): Promise<void> {
    if (!detail || dismissing) return;
    setDismissing(true);
    try {
      await onDismiss(detail.id);
      onBack();
    } finally {
      setDismissing(false);
    }
  }

  const backButton = (
    <button
      type="button"
      className="flex items-center gap-1 text-sm text-flaque-steel transition hover:text-flaque-ink"
      onClick={onBack}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {t("playlists:backToPlaylists")}
    </button>
  );

  if (loading) {
    return (
      <section className="m-4 rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        {backButton}
        <p className="mt-4 text-sm text-flaque-steel">{t("playlists:loading")}</p>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="m-4 rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        {backButton}
        <p className="mt-4 text-sm text-flaque-steel">{t("playlists:forYouNotFound")}</p>
      </section>
    );
  }

  const headerCoverUrl = detail.seedArtistPhoto ? coverPathUrl(detail.seedArtistPhoto) : null;

  return (
    <section className="m-4 space-y-4">
      {backButton}

      {/* Header card */}
      <div className="rounded-2xl p-5">
        <div className="flex flex-col gap-5 sm:flex-row">
           {/* Seed artist visual */}
           <div className="group relative h-48 w-48 shrink-0 self-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-100/80 to-purple-100/60 sm:self-start">
             {headerCoverUrl ? (
               <img
                 src={headerCoverUrl}
                 alt={detail.seedArtist}
                 className="absolute inset-0 h-full w-full object-cover"
                 loading="lazy"
               />
             ) : null}
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 px-3 text-center">
               <svg className="h-8 w-8 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                   d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
               </svg>
               <p className="mt-2 font-display text-lg font-bold leading-tight text-white drop-shadow">{detail.seedArtist}</p>
             </div>

             {/* Play button overlay */}
             <button
               type="button"
               className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"
               onClick={handlePlayAll}
               aria-label={t("playlists:play", { name: forYouPlaylistName(t, detail) })}
             >
               <svg className="h-12 w-12 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                 <path d="M8 6v12l10-6-10-6z" />
               </svg>
             </button>
           </div>

          {/* Info */}
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="font-display text-2xl text-flaque-ink">{forYouPlaylistName(t, detail)}</h2>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-flaque-steel">
              <span className="rounded-full bg-indigo-100/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-600/80">
                Made for you
              </span>
              <span>{t("common:trackCount", { count: detail.trackCount })}</span>
              {totalDuration > 0 ? <span>{formatDurationCompact(totalDuration)}</span> : null}
              <span>{t("playlists:generated", { date: new Date(detail.generatedAt).toLocaleDateString(activeLocale()) })}</span>
            </div>

            {/* Action buttons */}
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

              <button
                type="button"
                className="flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2 text-sm text-red-500 transition hover:bg-red-50"
                onClick={() => { void handleDismiss(); }}
                disabled={dismissing}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {dismissing ? t("playlists:hiding") : t("playlists:notInterested")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <PlaylistTrackList tracks={tracks} onTrackPlay={handlePlayFromTrack} />
    </section>
  );
}
