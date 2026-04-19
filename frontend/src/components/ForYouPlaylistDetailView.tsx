import { useEffect, useMemo, useState } from "react";

import { coverUrl, getForYouPlaylistDetail } from "../api";
import type { ForYouPlaylistDetail, Playlist, Track } from "../types";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "../utils/tracks";

export type ForYouPlaylistDetailViewProps = {
  playlistId: string;
  allTracksById: Map<string, Track>;
  onBack: () => void;
  onPlayTrack: (playlist: Playlist) => void;
  onDismiss: (playlistId: string) => Promise<void>;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function ForYouPlaylistDetailView({
  playlistId,
  allTracksById,
  onBack,
  onPlayTrack,
  onDismiss
}: ForYouPlaylistDetailViewProps): JSX.Element {
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

  function handlePlayAll(): void {
    if (!detail || tracks.length === 0) return;
    const fakePlaylist: Playlist = {
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
    onPlayTrack(fakePlaylist);
  }

  function handleShufflePlay(): void {
    if (!detail || tracks.length === 0) return;
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    const fakePlaylist: Playlist = {
      id: detail.id,
      name: detail.name,
      authorId: "system",
      visibility: "public",
      trackIds: shuffled.map((t) => t.id),
      description: "",
      cover: null,
      hearts: [],
      heartCount: 0,
      listenCount: 0,
      collaborators: []
    };
    onPlayTrack(fakePlaylist);
  }

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
      Back to playlists
    </button>
  );

  if (loading) {
    return (
      <section className="m-4 rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        {backButton}
        <p className="mt-4 text-sm text-flaque-steel">Loading...</p>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="m-4 rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        {backButton}
        <p className="mt-4 text-sm text-flaque-steel">For-you playlist not found.</p>
      </section>
    );
  }

  return (
    <section className="m-4 space-y-4">
      {backButton}

      {/* Header card */}
      <div className="rounded-2xl border border-flaque-clay/60 bg-gradient-to-br from-indigo-50/80 to-purple-50/60 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-col gap-5 sm:flex-row">
           {/* Seed artist visual */}
           <div className="relative h-48 w-48 shrink-0 items-center justify-center self-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-100/80 to-purple-100/60 sm:self-start">
             <div className="text-center px-3">
               <svg className="mx-auto h-8 w-8 text-indigo-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                   d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
               </svg>
               <p className="mt-2 font-display text-lg font-bold text-flaque-ink/70 leading-tight">{detail.seedArtist}</p>
             </div>
             
             {/* Play button overlay */}
             <button
               type="button"
               className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"
               onClick={handlePlayAll}
               aria-label={`Play ${detail.name}`}
             >
               <svg className="h-10 w-10 text-[#ffffff] drop-shadow-md" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                 <path d="M8 6v12l10-6-10-6z" />
               </svg>
             </button>
           </div>

          {/* Info */}
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="font-display text-2xl text-flaque-ink">{detail.name}</h2>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-flaque-steel">
              <span className="rounded-full bg-indigo-100/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-600/80">
                Made for you
              </span>
              <span>{detail.trackCount} track{detail.trackCount !== 1 ? "s" : ""}</span>
              {totalDuration > 0 ? <span>{formatDuration(totalDuration)}</span> : null}
              <span>Generated {new Date(detail.generatedAt).toLocaleDateString()}</span>
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
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h4l3 9 3-9h4M4 20h4l3-9 3 9h4" />
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
                {dismissing ? "Hiding..." : "Not interested"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="rounded-2xl border border-flaque-clay/60 bg-white/85 shadow-panel backdrop-blur-sm">
        {tracks.length === 0 ? (
          <p className="px-5 py-4 text-sm text-flaque-steel">No playable tracks.</p>
        ) : (
          <ul>
            {tracks.map((track, index) => (
              <li
                key={track.id}
                className="flex items-center gap-3 border-b border-flaque-clay/20 px-4 py-2.5 last:border-b-0 transition hover:bg-flaque-cream/30"
              >
                <span className="w-6 shrink-0 text-right text-xs text-flaque-steel/50">{index + 1}</span>
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                  <img src={coverUrl(track.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-medium text-flaque-ink">
                    {track.tags.extra?.lyrics ? (
                      <span className="shrink-0 rounded px-1 py-px font-mono text-[9px] font-bold leading-none text-flaque-steel/70 ring-1 ring-flaque-clay/60">
                        L
                      </span>
                    ) : null}
                    <span className="truncate">{getTrackDisplayTitle(track)}</span>
                  </p>
                  <p className="truncate text-xs text-flaque-steel">
                    {getTrackDisplayArtist(track) ?? "Unknown artist"}
                    {track.tags.album ? ` \u00b7 ${track.tags.album}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-flaque-steel/60">
                  {formatDuration(track.duration)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
