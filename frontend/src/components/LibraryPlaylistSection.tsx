import { FormEvent, useState } from "react";

import { coverUrl, playlistCoverUrl } from "../api";
import type { AutoPlaylistSummary, ForYouPlaylistSummary, Playlist, PlaylistVisibility, Track, User } from "../types";

type LibraryPlaylistSectionProps = {
  availablePlaylists: Playlist[];
  manageablePlaylists: Playlist[];
  ownerNameById: Record<string, string>;
  allTracksById: Map<string, Track>;
  user: User;
  onCreatePlaylist: (input: { name: string; visibility: PlaylistVisibility; description?: string }) => Promise<void>;
  onPlayPlaylist: (playlist: Playlist) => void;
  onPatchPlaylist: (playlistId: string, patch: { name?: string; visibility?: PlaylistVisibility; trackIds?: string[]; description?: string; collaborators?: string[] }) => Promise<void>;
  onDeletePlaylist: (playlistId: string) => Promise<void>;
  onNavigateToPlaylist: (playlistId: string) => void;
  onHeartPlaylist: (playlistId: string) => Promise<{ hearted: boolean; heartCount: number }>;
  onReportPlaylistListen: (playlistId: string) => Promise<void>;
  autoPlaylists: AutoPlaylistSummary[];
  loadingAutoPlaylists: boolean;
  forYouPlaylists: ForYouPlaylistSummary[];
  loadingForYouPlaylists: boolean;
  onDismissForYouPlaylist: (playlistId: string) => Promise<void>;
};

// ── Mosaic cover (compact) ─────────────────────────────────────────

function getPlaylistMosaicTracks(trackIds: string[], allTracksById: Map<string, Track>): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];
  for (const id of trackIds) {
    if (result.length >= 4) break;
    const track = allTracksById.get(id);
    if (!track) continue;
    const albumKey = track.tags.album ?? track.id;
    if (!seen.has(albumKey)) {
      seen.add(albumKey);
      result.push(track);
    }
  }
  return result;
}

function PlaylistMosaic({ tracks }: { tracks: Track[] }): JSX.Element {
  const slots = Array.from({ length: 4 }, (_, i) => tracks[i] ?? null);

  if (tracks.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-flaque-clay/20">
        <svg className="h-8 w-8 text-flaque-steel/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
    );
  }

  if (tracks.length === 1) {
    return (
      <img src={coverUrl(tracks[0]!.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
    );
  }

  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2">
      {slots.map((track, i) =>
        track ? (
          <img key={i} src={coverUrl(track.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div key={i} className="bg-flaque-clay/20" />
        )
      )}
    </div>
  );
}

// ── Playlist card (grid) ───────────────────────────────────────────

type PlaylistCardProps = {
  playlist: Playlist;
  allTracksById: Map<string, Track>;
  ownerNameById: Record<string, string>;
  onNavigate: () => void;
  onPlay: () => void;
  showBadges?: boolean;
  onHeart?: () => void;
  hasHearted?: boolean;
};

function PlaylistCard({ playlist, allTracksById, ownerNameById, onNavigate, onPlay, showBadges, onHeart, hasHearted }: PlaylistCardProps): JSX.Element {
  const mosaicTracks = getPlaylistMosaicTracks(playlist.trackIds, allTracksById);
  const owner = ownerNameById[playlist.authorId] ?? playlist.authorId;

  return (
    <div
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-flaque-clay/60 bg-white/85 shadow-sm transition hover:shadow-md"
      onClick={onNavigate}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onNavigate(); }}
    >
      {/* Cover */}
      <div className="relative aspect-square w-full overflow-hidden">
        {playlist.cover ? (
          <img src={playlistCoverUrl(playlist.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <PlaylistMosaic tracks={mosaicTracks} />
        )}

        {/* Play button overlay */}
        {onPlay ? (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            aria-label={`Play ${playlist.name}`}
          >
            <svg className="h-10 w-10 text-white drop-shadow-md" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 6v12l10-6-10-6z" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col p-2">
        <p className="truncate text-xs font-semibold text-flaque-ink">{playlist.name}</p>
        {playlist.description ? (
          <p className="mt-0.5 line-clamp-1 text-[10px] text-flaque-steel">{playlist.description}</p>
        ) : null}
        <p className="mt-0.5 truncate text-[10px] text-flaque-steel">
          {owner} &middot; {playlist.trackIds.length} track{playlist.trackIds.length !== 1 ? "s" : ""}
        </p>

        {/* Badges */}
        {showBadges ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {onHeart ? (
              <button
                type="button"
                className={`flex items-center gap-0.5 text-[10px] transition ${
                  hasHearted ? "text-red-500 hover:text-red-600" : "text-flaque-steel hover:text-red-400"
                }`}
                onClick={(e) => { e.stopPropagation(); onHeart(); }}
                aria-label={hasHearted ? "Remove heart" : "Heart playlist"}
              >
                <svg className="h-3 w-3" fill={hasHearted ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {playlist.heartCount > 0 ? playlist.heartCount : ""}
              </button>
            ) : playlist.heartCount > 0 ? (
              <span className="flex items-center gap-0.5 text-[10px] text-red-400">
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                {playlist.heartCount}
              </span>
            ) : null}
            {playlist.listenCount > 0 ? (
              <span className="flex items-center gap-0.5 text-[10px] text-flaque-steel">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {playlist.listenCount}
              </span>
            ) : null}
            {/* Collaborators badge */}
            {playlist.collaborators.length > 0 ? (
              playlist.collaborators.includes("everyone") ? (
                <span className="flex items-center gap-0.5 text-[10px] text-yellow-600">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zM12 11a2 2 0 100 4 2 2 0 000-4z"/>
                  </svg>
                  Everyone
                </span>
              ) : (
                <>
                  {playlist.collaborators.map((collabId) => {
                    const collabName = ownerNameById[collabId] ?? collabId;
                    return (
                      <span key={collabId} className="inline-flex items-center gap-1 rounded-full bg-flaque-cream px-2 py-0.5 text-[10px] font-medium text-flaque-ink">
                        {collabName}
                      </span>
                    );
                  })}
                </>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }): JSX.Element {
  return <h3 className="font-display text-lg text-flaque-ink">{title}</h3>;
}

// ── Main section ───────────────────────────────────────────────────

export function LibraryPlaylistSection({
  availablePlaylists,
  manageablePlaylists,
  ownerNameById,
  allTracksById,
  user,
  onCreatePlaylist,
  onPlayPlaylist,
  onPatchPlaylist: _onPatchPlaylist,
  onDeletePlaylist: _onDeletePlaylist,
  onNavigateToPlaylist,
  onHeartPlaylist,
  onReportPlaylistListen,
  autoPlaylists,
  loadingAutoPlaylists,
  forYouPlaylists,
  loadingForYouPlaylists,
  onDismissForYouPlaylist
}: LibraryPlaylistSectionProps): JSX.Element {
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistVisibility, setPlaylistVisibility] = useState<PlaylistVisibility>("private");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const myPlaylists = availablePlaylists.filter((p) => p.authorId === user.id);
  const popularPlaylists = availablePlaylists
    .filter((p) => p.visibility === "public" && p.authorId !== user.id)
    .sort((a, b) => (b.heartCount * 3 + b.listenCount) - (a.heartCount * 3 + a.listenCount));

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setStatusMessage(null);
    try {
      await onCreatePlaylist({
        name: playlistName,
        visibility: playlistVisibility,
        description: playlistDescription.trim() || undefined
      });
      setPlaylistName("");
      setPlaylistDescription("");
      setStatusMessage("Playlist created.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to create playlist");
    } finally {
      setSubmitting(false);
    }
  }

  function handlePlay(playlist: Playlist): void {
    void onReportPlaylistListen(playlist.id);
    onPlayPlaylist(playlist);
  }

  return (
    <div className="m-4 space-y-6">
      {/* ── My Playlists ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <SectionHeader title="My Playlists" />

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => { void handleSubmit(event); }}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
            <input
              className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="text"
              placeholder="New playlist name"
              value={playlistName}
              onChange={(event) => setPlaylistName(event.target.value)}
            />
            <select
              className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              value={playlistVisibility}
              onChange={(event) => setPlaylistVisibility(event.target.value as PlaylistVisibility)}
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
            <button
              className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={submitting || !playlistName.trim()}
            >
              {submitting ? "Creating..." : "Create"}
            </button>
          </div>
          {playlistName.trim() ? (
            <textarea
              className="w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              rows={2}
              placeholder="Description (optional)"
              value={playlistDescription}
              onChange={(event) => setPlaylistDescription(event.target.value)}
            />
          ) : null}
        </form>

        {statusMessage ? <p className="mt-2 text-sm text-flaque-steel">{statusMessage}</p> : null}

        {myPlaylists.length === 0 ? (
          <p className="mt-4 text-sm text-flaque-steel">No playlists yet.</p>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {myPlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                allTracksById={allTracksById}
                ownerNameById={ownerNameById}
                onNavigate={() => onNavigateToPlaylist(playlist.id)}
                onPlay={() => handlePlay(playlist)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Made For You ────────────────────────────────────────── */}
      {!loadingForYouPlaylists && forYouPlaylists.length > 0 ? (
        <section className="rounded-xl border border-flaque-clay/60 bg-gradient-to-br from-indigo-50/60 to-purple-50/40 p-5 shadow-panel backdrop-blur-sm">
          <SectionHeader title="Made for you" />
          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {forYouPlaylists.map((fy) => (
              <div
                key={fy.id}
                className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-flaque-clay/60 bg-gradient-to-br from-indigo-50/80 to-purple-50/60 shadow-sm transition hover:shadow-md"
                onClick={() => onNavigateToPlaylist(fy.id)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") onNavigateToPlaylist(fy.id); }}
              >
                <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-indigo-100/60 to-purple-100/40">
                  <div className="text-center px-3">
                    <svg className="mx-auto h-8 w-8 text-indigo-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    <p className="mt-1 font-display text-sm font-bold text-flaque-ink/70 leading-tight">{fy.seedArtist}</p>
                  </div>
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-flaque-ink">{fy.name}</p>
                  <p className="mt-0.5 text-xs text-flaque-steel">
                    {fy.trackCount} track{fy.trackCount !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Dismiss button */}
                <button
                  type="button"
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-flaque-steel opacity-0 shadow-sm transition hover:bg-white hover:text-red-500 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onDismissForYouPlaylist(fy.id);
                  }}
                  aria-label={`Hide ${fy.name}`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Popular Playlists ─────────────────────────────────────── */}
      {popularPlaylists.length > 0 ? (
        <section className="rounded-xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
          <SectionHeader title="Popular Playlists" />
          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {popularPlaylists.map((playlist) => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                allTracksById={allTracksById}
                ownerNameById={ownerNameById}
                onNavigate={() => onNavigateToPlaylist(playlist.id)}
                onPlay={() => handlePlay(playlist)}
                showBadges
                onHeart={() => { void onHeartPlaylist(playlist.id); }}
                hasHearted={playlist.hearts.includes(user.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Automatic Playlists ────────────────────────────────────── */}
      <section className="rounded-xl border border-flaque-clay/60 bg-gradient-to-br from-white/85 to-flaque-cream/40 p-5 shadow-panel backdrop-blur-sm">
        <SectionHeader title="Automatic Playlists" />
        {loadingAutoPlaylists ? (
          <p className="mt-2 text-sm text-flaque-steel">Loading...</p>
        ) : autoPlaylists.length === 0 ? (
          <p className="mt-2 text-sm text-flaque-steel">
            Automatic playlists will appear here once generated.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {autoPlaylists.map((ap) => (
              <div
                key={ap.id}
                className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-flaque-clay/60 bg-gradient-to-br from-flaque-ink/5 to-flaque-sand/30 shadow-sm transition hover:shadow-md"
                onClick={() => onNavigateToPlaylist(ap.id)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") onNavigateToPlaylist(ap.id); }}
              >
                <div className="flex aspect-square w-full items-center justify-center bg-gradient-to-br from-flaque-sand/40 to-flaque-clay/20">
                  <div className="text-center">
                    <p className="font-display text-2xl font-bold text-flaque-ink/70">{ap.decade % 100 === 0 ? ap.decade : `${ap.decade % 100}s`}</p>
                    <p className="mt-0.5 text-xs font-medium text-flaque-steel">{ap.genre}</p>
                  </div>
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-flaque-ink">{ap.name}</p>
                  <p className="mt-0.5 text-xs text-flaque-steel">
                    {ap.trackCount} track{ap.trackCount !== 1 ? "s" : ""}
                    {" \u00b7 "}Generated {new Date(ap.generatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
