import { useEffect, useMemo, useState } from "react";

import { coverUrl, getAutoPlaylistDetail } from "../api";
import type { AutoPlaylistDetail, Playlist, Track } from "../types";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "../utils/tracks";

export type AutoPlaylistDetailViewProps = {
  playlistId: string;
  allTracksById: Map<string, Track>;
  onBack: () => void;
  onPlayTrack: (playlist: Playlist) => void;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function AutoPlaylistDetailView({
  playlistId,
  allTracksById,
  onBack,
  onPlayTrack
}: AutoPlaylistDetailViewProps): JSX.Element {
  const [detail, setDetail] = useState<AutoPlaylistDetail | null>(null);
  const [detailTracks, setDetailTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAutoPlaylistDetail(playlistId)
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

  if (loading) {
    return (
      <section className="m-4 rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <button
          type="button"
          className="mb-4 flex items-center gap-1 text-sm text-flaque-steel transition hover:text-flaque-ink"
          onClick={onBack}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to playlists
        </button>
        <p className="text-sm text-flaque-steel">Loading...</p>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="m-4 rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <button
          type="button"
          className="mb-4 flex items-center gap-1 text-sm text-flaque-steel transition hover:text-flaque-ink"
          onClick={onBack}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to playlists
        </button>
        <p className="text-sm text-flaque-steel">Auto playlist not found.</p>
      </section>
    );
  }

  const decadeLabel = detail.decade % 100 === 0 ? `${detail.decade}` : `${detail.decade % 100}s`;
  const [c1, c2, c3] = detail.colors ?? ["hsl(220, 60%, 50%)", "hsl(260, 60%, 50%)", "hsl(340, 60%, 50%)"];
  const angle = detail.gradientAngle ?? 135;
  const gradientStyle = { background: `linear-gradient(${angle}deg, ${c1}, ${c2}, ${c3})` };

  return (
    <section className="m-4 space-y-4">
      {/* Back button */}
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

      {/* Header card */}
      <div className="rounded-2xl border border-flaque-clay/60 bg-gradient-to-br from-white/85 to-flaque-cream/40 p-5 shadow-panel backdrop-blur-sm">
        <div className="group flex flex-col gap-5 sm:flex-row">
           {/* Genre/decade visual */}
           <div className="relative h-48 w-48 shrink-0 self-center overflow-hidden rounded-2xl sm:self-start" style={gradientStyle}>
             <div className="flex h-full w-full flex-col items-center justify-center">
               <p className="font-display text-6xl font-extrabold text-white drop-shadow-md">{decadeLabel}</p>
               <p className="mt-1 text-sm font-medium text-white/80">{detail.genre}</p>
             </div>

             {/* Play button overlay */}
             <button
               type="button"
               className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"
               onClick={handlePlayAll}
               aria-label={`Play ${detail.name}`}
             >
               <svg className="h-12 w-12 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                 <path d="M8 6v12l10-6-10-6z" />
               </svg>
             </button>
           </div>

          {/* Info */}
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="font-display text-2xl text-flaque-ink">{detail.name}</h2>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-flaque-steel">
              <span className="rounded-full bg-flaque-sand/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-flaque-ink/70">
                Auto-generated
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
