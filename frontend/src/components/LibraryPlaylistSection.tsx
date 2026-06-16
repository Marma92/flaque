import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import defaultCoverImage from "../assets/default-cover.png";
import { coverPathUrl, coverUrl, getForYouPlaylistDetail, playlistCoverUrl } from "../api";
import { autoPlaylistName, forYouPlaylistName, personalPlaylistDescription, personalPlaylistName } from "../utils/generatedPlaylists";
import type { AutoPlaylistSummary, ForYouPlaylistSummary, PersonalPlaylistSummary, Playlist, PlaylistVisibility, Track, User } from "../types";
import { SkeletonCardGrid } from "./Skeleton";

const PLAYLIST_GRID_CLASS = "mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6";

export type LibraryPlaylistSectionProps = {
  availablePlaylists: Playlist[];
  manageablePlaylists: Playlist[];
  ownerNameById: Record<string, string>;
  allTracksById: Map<string, Track>;
  user: User;
  onCreatePlaylist: (input: { name: string; visibility: PlaylistVisibility; description?: string }) => Promise<void>;
  onPlayPlaylist: (playlist: Playlist, options?: { shuffle?: boolean }) => void;
  onPatchPlaylist: (playlistId: string, patch: { name?: string; visibility?: PlaylistVisibility; trackIds?: string[]; description?: string; collaborators?: string[] }) => Promise<Playlist>;
  onDeletePlaylist: (playlistId: string) => Promise<void>;
  onNavigateToPlaylist: (playlistId: string) => void;
  onHeartPlaylist: (playlistId: string) => Promise<{ hearted: boolean; heartCount: number }>;
  onReportPlaylistListen: (playlistId: string) => Promise<void>;
  autoPlaylists: AutoPlaylistSummary[];
  loadingAutoPlaylists: boolean;
  forYouPlaylists: ForYouPlaylistSummary[];
  loadingForYouPlaylists: boolean;
  onDismissForYouPlaylist: (playlistId: string) => Promise<void>;
  onRefreshForYouPlaylists?: () => Promise<{ regenerated: number }>;
  personalPlaylists: PersonalPlaylistSummary[];
  loadingPersonalPlaylists: boolean;
  onRefreshPersonalPlaylists?: () => Promise<{ regenerated: number }>;
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
      <img src={defaultCoverImage} alt="" className="h-full w-full object-cover" />
    );
  }

  if (tracks.length === 1) {
    return (
      <img
        src={coverUrl(tracks[0]!.id)}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
        onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
      />
    );
  }

  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2">
      {slots.map((track, i) =>
        track ? (
          <img
            key={i}
            src={coverUrl(track.id)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
          />
        ) : (
          <img key={i} src={defaultCoverImage} alt="" className="h-full w-full object-cover" />
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
  const { t } = useTranslation(["playlists", "common"]);
  const mosaicTracks = getPlaylistMosaicTracks(playlist.trackIds, allTracksById);
  const owner = ownerNameById[playlist.authorId] ?? playlist.authorId;

  return (
    <div
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white/85 shadow-sm transition hover:shadow-lg"
      onClick={onNavigate}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onNavigate(); }}
    >
      {/* Cover */}
      <div className="group/cover relative aspect-square w-full overflow-hidden">
        {playlist.cover ? (
          <img src={playlistCoverUrl(playlist.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <PlaylistMosaic tracks={mosaicTracks} />
        )}

        {/* Play button overlay */}
        {onPlay ? (
          <button
            type="button"
            className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover/cover:bg-black/35 group-hover/cover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            aria-label={t("playlists:play", { name: playlist.name })}
          >
            <svg className="h-10 w-10 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
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
          {owner} &middot; {t("common:trackCount", { count: playlist.trackIds.length })}
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
                aria-label={hasHearted ? t("playlists:removeHeart") : t("playlists:heart")}
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
            {(playlist.collaborators ?? []).length > 0 ? (
              (playlist.collaborators ?? []).includes("everyone") ? (
                <span className="flex items-center gap-0.5 text-[10px] text-yellow-600">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zM12 11a2 2 0 100 4 2 2 0 000-4z"/>
                  </svg>
                  {t("playlists:collaborators.everyone")}
                </span>
              ) : (
                <>
                  {(playlist.collaborators ?? []).map((collabId) => {
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
  onDismissForYouPlaylist,
  onRefreshForYouPlaylists,
  personalPlaylists,
  loadingPersonalPlaylists,
  onRefreshPersonalPlaylists
}: LibraryPlaylistSectionProps): JSX.Element {
  const { t } = useTranslation(["playlists", "common"]);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistVisibility, setPlaylistVisibility] = useState<PlaylistVisibility>("private");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const myPlaylists = availablePlaylists.filter((p) => p.authorId === user.id);
  const popularPlaylists = availablePlaylists
    .filter((p) => p.visibility === "public" && p.authorId !== user.id)
    .sort((a, b) => b.heartCount - a.heartCount || b.listenCount - a.listenCount);

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
      setStatusMessage(t("playlists:created"));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : t("playlists:createError"));
    } finally {
      setSubmitting(false);
    }
  }

  function handlePlay(playlist: Playlist): void {
    void onReportPlaylistListen(playlist.id);
    onPlayPlaylist(playlist);
  }

  async function handlePlayForYou(fy: ForYouPlaylistSummary): Promise<void> {
    try {
      const result = await getForYouPlaylistDetail(fy.id);
      const synthetic: Playlist = {
        id: result.playlist.id,
        name: result.playlist.name,
        authorId: "system",
        visibility: "public",
        trackIds: result.playlist.trackIds,
        description: "",
        cover: null,
        hearts: [],
        heartCount: 0,
        listenCount: 0,
        collaborators: []
      };
      onPlayPlaylist(synthetic);
    } catch {
      // ignore
    }
  }

  return (
    <div className="m-4 space-y-6">
      {/* ── My Playlists ──────────────────────────────────────────── */}
      <section className="flaque-panel p-5">
        <SectionHeader title={t("playlists:myPlaylists")} />

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => { void handleSubmit(event); }}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
            <input
              className="flaque-input text-sm"
              type="text"
              placeholder={t("playlists:newPlaylistName")}
              value={playlistName}
              onChange={(event) => setPlaylistName(event.target.value)}
            />
            <select
              className="flaque-input text-sm"
              value={playlistVisibility}
              onChange={(event) => setPlaylistVisibility(event.target.value as PlaylistVisibility)}
            >
              <option value="private">{t("playlists:visibility.private")}</option>
              <option value="public">{t("playlists:visibility.public")}</option>
            </select>
            <button
              className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={submitting || !playlistName.trim()}
            >
              {submitting ? t("playlists:creating") : t("playlists:create")}
            </button>
          </div>
          {playlistName.trim() ? (
            <textarea
              className="flaque-input text-sm"
              rows={2}
              placeholder={t("playlists:descriptionOptional")}
              value={playlistDescription}
              onChange={(event) => setPlaylistDescription(event.target.value)}
            />
          ) : null}
        </form>

        {statusMessage ? <p className="mt-2 text-sm text-flaque-steel">{statusMessage}</p> : null}

        {myPlaylists.length === 0 ? (
          <p className="mt-4 text-sm text-flaque-steel">{t("playlists:noPlaylistsYet")}</p>
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
      <section className="flaque-panel p-5">
        <div className="flex items-center justify-between">
          <SectionHeader title={t("playlists:madeForYou")} />
          {!loadingForYouPlaylists && onRefreshForYouPlaylists ? (
            <button
              type="button"
              className="text-xs text-flaque-steel hover:text-flaque-ink"
              onClick={() => { void onRefreshForYouPlaylists?.(); }}
              title={t("playlists:refreshRecommendations")}
              aria-label={t("playlists:refreshRecommendations")}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          ) : null}
        </div>
        {loadingForYouPlaylists ? (
          <>
            <p className="sr-only" role="status">{t("playlists:forYouLoading")}</p>
            <SkeletonCardGrid className={PLAYLIST_GRID_CLASS} />
          </>
        ) : forYouPlaylists.length > 0 ? (
          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {forYouPlaylists.map((fy) => {
              const artistPhotoUrl = fy.seedArtistPhoto ? coverPathUrl(fy.seedArtistPhoto) : null;
              const fyName = forYouPlaylistName(t, fy);
              return (
                <div
                  key={fy.id}
                  className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white/85 shadow-sm transition hover:shadow-lg"
                  onClick={() => onNavigateToPlaylist(fy.id)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") onNavigateToPlaylist(fy.id); }}
                >
                  <div className="group/cover relative aspect-square w-full overflow-hidden bg-gradient-to-br from-indigo-100/60 to-purple-100/40">
                    {artistPhotoUrl ? (
                      <img
                        src={artistPhotoUrl}
                        alt={fy.seedArtist}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-flaque-cream to-flaque-clay/60 text-flaque-steel">
                        <span className="font-display text-3xl">{fy.seedArtist.charAt(0).toUpperCase()}</span>
                      </div>
                    )}

                    {/* Play button overlay */}
                    <button
                      type="button"
                      className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover/cover:bg-black/35 group-hover/cover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); void handlePlayForYou(fy); }}
                      aria-label={t("playlists:play", { name: fyName })}
                    >
                      <svg className="h-10 w-10 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                        <path d="M8 6v12l10-6-10-6z" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-2">
                    <p className="line-clamp-2 min-h-[2rem] text-center text-xs font-semibold text-flaque-ink">{fyName}</p>
                  </div>

                  {/* Dismiss button */}
                  <button
                    type="button"
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/80 text-flaque-steel opacity-0 shadow-sm transition hover:bg-white hover:text-red-500 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDismissForYouPlaylist(fy.id);
                    }}
                    aria-label={t("playlists:hide", { name: fyName })}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-flaque-steel">{t("playlists:forYouEmpty")}</p>
        )}
      </section>

      {/* ── Popular Playlists ─────────────────────────────────────── */}
      {popularPlaylists.length > 0 ? (
        <section className="flaque-panel p-5">
          <SectionHeader title={t("playlists:popularPlaylists")} />
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
                hasHearted={(playlist.hearts ?? []).includes(user.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Personal Mixes ─────────────────────────────────────────── */}
      {(loadingPersonalPlaylists || personalPlaylists.length > 0) ? (
        <section className="rounded-xl border border-flaque-clay/60 bg-gradient-to-br from-white/85 to-flaque-cream/40 p-5 shadow-panel backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <SectionHeader title={t("playlists:personalMixes")} />
            {!loadingPersonalPlaylists && onRefreshPersonalPlaylists ? (
              <button
                type="button"
                className="text-xs text-flaque-steel hover:text-flaque-ink"
                onClick={() => { void onRefreshPersonalPlaylists(); }}
                title={t("playlists:refreshPersonalMixes")}
                aria-label={t("playlists:refreshPersonalMixes")}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            ) : null}
          </div>
          {loadingPersonalPlaylists ? (
            <>
              <p className="sr-only" role="status">{t("playlists:loading")}</p>
              <SkeletonCardGrid className={PLAYLIST_GRID_CLASS} />
            </>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
              {personalPlaylists.map((pp) => {
                const [c1, c2, c3] = pp.colors ?? ["hsl(220, 60%, 50%)", "hsl(260, 60%, 50%)", "hsl(340, 60%, 50%)"];
                const angle = pp.gradientAngle ?? 135;
                const gradientStyle = { background: `linear-gradient(${angle}deg, ${c1}, ${c2}, ${c3})` };
                const mosaic = pp.mosaicCovers ?? [];
                return (
                  <div
                    key={pp.id}
                    className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white/85 shadow-sm transition hover:shadow-lg"
                    onClick={() => onNavigateToPlaylist(pp.id)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") onNavigateToPlaylist(pp.id); }}
                  >
                    <div className="group/cover relative aspect-square w-full overflow-hidden" style={gradientStyle}>
                      {mosaic.length > 0 ? (
                        <div
                          className={`absolute inset-0 grid ${mosaic.length === 1 ? "grid-cols-1" : "grid-cols-2"} ${mosaic.length <= 2 ? "grid-rows-1" : "grid-rows-2"}`}
                        >
                          {mosaic.slice(0, 4).map((cover, i) => (
                            <img
                              key={`${pp.id}-cover-${i}`}
                              src={coverPathUrl(cover)}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ))}
                        </div>
                      ) : null}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-2 pt-6 text-center">
                        <p
                          className="line-clamp-2 font-display text-sm font-bold leading-tight drop-shadow"
                          style={{ color: "#ffffff" }}
                        >
                          {personalPlaylistName(t, pp.variant)}
                        </p>
                      </div>

                      {/* Play button overlay */}
                      <button
                        type="button"
                        className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover/cover:bg-black/35 group-hover/cover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); onNavigateToPlaylist(pp.id); }}
                        aria-label={t("playlists:open", { name: personalPlaylistName(t, pp.variant) })}
                      >
                        <svg className="h-10 w-10 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                          <path d="M8 6v12l10-6-10-6z" />
                        </svg>
                      </button>
                    </div>
                    <div className="p-2">
                      <p className="line-clamp-2 text-xs text-flaque-steel">{personalPlaylistDescription(t, pp.variant)}</p>
                      <p className="mt-0.5 text-xs text-flaque-steel/80">
                        {t("common:trackCount", { count: pp.trackCount })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {/* ── Automatic Playlists ────────────────────────────────────── */}
      <section className="rounded-xl border border-flaque-clay/60 bg-gradient-to-br from-white/85 to-flaque-cream/40 p-5 shadow-panel backdrop-blur-sm">
        <SectionHeader title={t("playlists:automaticPlaylists")} />
        {loadingAutoPlaylists ? (
          <>
            <p className="sr-only" role="status">{t("playlists:loading")}</p>
            <SkeletonCardGrid className={PLAYLIST_GRID_CLASS} />
          </>
        ) : autoPlaylists.length === 0 ? (
          <p className="mt-2 text-sm text-flaque-steel">
            {t("playlists:autoEmpty")}
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            {autoPlaylists.map((ap) => {
              const [c1, c2, c3] = ap.colors ?? ["hsl(220, 60%, 50%)", "hsl(260, 60%, 50%)", "hsl(340, 60%, 50%)"];
              const angle = ap.gradientAngle ?? 135;
              const gradientStyle = { background: `linear-gradient(${angle}deg, ${c1}, ${c2}, ${c3})` };
              const heroLabel = ap.axis === "genre-tempo" && ap.tempo
                ? t(`playlists:tempo.${ap.tempo}`)
                : ap.decade % 100 === 0
                  ? String(ap.decade)
                  : `${ap.decade % 100}s`;
              return (
                <div
                  key={ap.id}
                  className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white/85 shadow-sm transition hover:shadow-lg"
                  onClick={() => onNavigateToPlaylist(ap.id)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") onNavigateToPlaylist(ap.id); }}
                >
                  <div className="group/cover relative aspect-square w-full overflow-hidden" style={gradientStyle}>
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20">
                      <p
                        className="font-display text-5xl font-extrabold drop-shadow-md"
                        style={{ color: "#ffffff" }}
                      >
                        {heroLabel}
                      </p>
                      <p
                        className="mt-1 text-xs font-medium"
                        style={{ color: "rgba(255, 255, 255, 0.8)" }}
                      >
                        {ap.genre}
                      </p>
                    </div>

                    {/* Play button overlay */}
                    <button
                      type="button"
                      className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover/cover:bg-black/35 group-hover/cover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); onNavigateToPlaylist(ap.id); }}
                      aria-label={t("playlists:play", { name: autoPlaylistName(t, ap) })}
                    >
                      <svg className="h-10 w-10 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                        <path d="M8 6v12l10-6-10-6z" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-2">
                    <p className="truncate text-xs font-semibold text-flaque-ink">{autoPlaylistName(t, ap)}</p>
                    <p className="mt-0.5 text-xs text-flaque-steel">
                      {t("common:trackCount", { count: ap.trackCount })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
