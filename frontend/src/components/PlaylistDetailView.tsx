import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

import { deletePlaylistCover, getUsers, playlistCoverUrl, uploadPlaylistCover } from "../api";
import { usePlaylistDetailPlayback } from "../hooks/usePlaylistDetailPlayback";
import type { Playlist, PlaylistVisibility, Track, User } from "../types";
import { formatDurationCompact } from "../utils/format";
import { CollaboratorsField } from "./playlistDetail/CollaboratorsField";
import { PlaylistActions } from "./playlistDetail/PlaylistActions";
import { PlaylistCover, getPlaylistMosaicTracks } from "./playlistDetail/PlaylistCover";
import { PlaylistEditableTrackList } from "./playlistDetail/PlaylistEditableTrackList";
import { PlaylistTrackList } from "./PlaylistTrackList";

export type PlaylistDetailViewProps = {
  playlistId: string;
  availablePlaylists: Playlist[];
  manageablePlaylists: Playlist[];
  allTracksById: Map<string, Track>;
  ownerNameById: Record<string, string>;
  user: User;
  onBack: () => void;
  onPlay: (playlist: Playlist, options?: { shuffle?: boolean }) => void;
  onPlayTrack?: (track: Track, queueSource: Track[]) => void;
  onPatch: (playlistId: string, patch: { name?: string; visibility?: PlaylistVisibility; trackIds?: string[]; description?: string; collaborators?: string[] }) => Promise<Playlist>;
  onNavigate: (playlistId: string) => void;
  onDelete: (playlistId: string) => Promise<void>;
  onHeart: (playlistId: string) => Promise<{ hearted: boolean; heartCount: number }>;
  onReportListen: (playlistId: string) => Promise<void>;
};

export function PlaylistDetailView({
  playlistId,
  availablePlaylists,
  manageablePlaylists,
  allTracksById,
  ownerNameById,
  user,
  onBack,
  onPlay,
  onPlayTrack,
  onPatch,
  onNavigate,
  onDelete,
  onHeart,
  onReportListen
}: PlaylistDetailViewProps): JSX.Element {
  const playlist = availablePlaylists.find((p) => p.id === playlistId);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hearting, setHearting] = useState(false);
  const listenReportedRef = useRef(false);

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVisibility, setEditVisibility] = useState<PlaylistVisibility>("private");
  const [editTrackIds, setEditTrackIds] = useState<string[]>([]);
  const [editCollaboratorIds, setEditCollaboratorIds] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const isOwner = playlist ? playlist.authorId === user.id : false;

  const canManage = useMemo(() => {
    if (!playlist) return false;
    return manageablePlaylists.some((p) => p.id === playlist.id);
  }, [playlist, manageablePlaylists]);

  const canEdit = useMemo(() => {
    if (!playlist) return false;
    return canManage || (playlist.collaborators ?? []).includes(user.id) || (playlist.collaborators ?? []).includes("everyone");
  }, [playlist, canManage, user.id]);

  const canHeart = useMemo(() => {
    if (!playlist) return false;
    return playlist.visibility === "public" && playlist.authorId !== user.id;
  }, [playlist, user.id]);

  const hasHearted = useMemo(() => {
    if (!playlist) return false;
    return (playlist.hearts ?? []).includes(user.id);
  }, [playlist, user.id]);

  const tracks = useMemo(() => {
    if (!playlist) return [];
    return playlist.trackIds
      .map((id) => allTracksById.get(id))
      .filter((t): t is Track => t !== undefined);
  }, [playlist, allTracksById]);

  const mosaicTracks = useMemo(() => {
    if (!playlist) return [];
    return getPlaylistMosaicTracks(playlist.trackIds, allTracksById);
  }, [playlist, allTracksById]);

  const totalDuration = useMemo(() => tracks.reduce((sum, t) => sum + t.duration, 0), [tracks]);
  const owner = playlist ? (ownerNameById[playlist.authorId] ?? playlist.authorId) : "";

  useEffect(() => {
    listenReportedRef.current = false;
  }, [playlistId]);

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  function startEditing(): void {
    if (!playlist) return;
    setEditName(playlist.name);
    setEditDescription(playlist.description);
    setEditVisibility(playlist.visibility);
    setEditTrackIds([...playlist.trackIds]);
    setEditCollaboratorIds([...(playlist.collaborators ?? [])]);
    setCoverPreview(null);
    setCoverFile(null);
    setCoverRemoved(false);
    setEditing(true);
    if (isOwner) {
      void getUsers().then(setAllUsers).catch(() => {});
    }
  }

  function cancelEditing(): void {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(null);
    setCoverFile(null);
    setCoverRemoved(false);
    setEditing(false);
  }

  function handleCoverSelect(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverRemoved(false);
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
  }

  function handleCoverRemove(): void {
    setCoverFile(null);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(null);
    setCoverRemoved(true);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  if (!playlist) {
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
        <p className="text-sm text-flaque-steel">Playlist not found.</p>
      </section>
    );
  }

  const playback = usePlaylistDetailPlayback({
    playlist: playlist ?? null,
    tracks,
    onPlay,
    onPlayTrack
  });

  function reportListenOnce(): void {
    if (!playlist || listenReportedRef.current) return;
    listenReportedRef.current = true;
    void onReportListen(playlist.id);
  }

  function handlePlayAll(): void {
    reportListenOnce();
    playback.handlePlayAll();
  }

  function handlePlayTrack(track: Track): void {
    reportListenOnce();
    playback.handlePlayFromTrack(track);
  }

  function handleShufflePlay(): void {
    reportListenOnce();
    playback.handleShufflePlay();
  }

  async function handleHeart(): Promise<void> {
    if (hearting) return;
    setHearting(true);
    try {
      await onHeart(playlist!.id);
    } finally {
      setHearting(false);
    }
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      if (coverFile || (coverRemoved && playlist!.cover)) {
        setCoverUploading(true);
        try {
          if (coverFile) {
            await uploadPlaylistCover(playlist!.id, coverFile);
          } else {
            await deletePlaylistCover(playlist!.id);
          }
        } catch {
          setCoverUploading(false);
          setSaving(false);
          return;
        }
        setCoverUploading(false);
      }
      const updated = await onPatch(playlist!.id, {
        name: editName.trim() || playlist!.name,
        visibility: editVisibility,
        description: editDescription.trim(),
        trackIds: editTrackIds,
        collaborators: isOwner ? editCollaboratorIds : undefined
      });
      setEditing(false);
      if (updated.id !== playlist!.id) {
        onNavigate(updated.id);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    await onDelete(playlist!.id);
    onBack();
  }

  const coverSrc = coverPreview
    ?? (coverRemoved ? null : (playlist.cover ? playlistCoverUrl(playlist.id) : null));

  return (
    <section className="m-4 space-y-4">
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-flaque-steel transition hover:text-flaque-ink"
        onClick={() => { if (editing) cancelEditing(); onBack(); }}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to playlists
      </button>

      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCoverSelect}
        disabled={saving || coverUploading}
      />

      <div className="rounded-2xl p-5">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="relative h-48 w-48 shrink-0 self-center overflow-hidden sm:self-start">
            {editing ? (
              <>
                <button
                  type="button"
                  className="group/cover relative h-full w-full rounded-2xl overflow-hidden"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={saving || coverUploading}
                >
                  {coverSrc ? (
                    <img src={coverSrc} alt="" className="h-full w-full rounded-2xl object-cover" />
                  ) : (
                    <PlaylistCover playlist={playlist} mosaicTracks={mosaicTracks} />
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/40 opacity-0 transition group-hover/cover:opacity-100">
                    <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="mt-1 text-xs font-medium text-white">Change cover</span>
                  </div>
                </button>
                {(coverPreview ?? (!coverRemoved && playlist.cover)) ? (
                  <button
                    type="button"
                    className="absolute bottom-1 right-1 rounded-lg bg-black/60 px-2 py-0.5 text-[10px] text-white transition hover:bg-red-600"
                    onClick={handleCoverRemove}
                    disabled={saving || coverUploading}
                  >
                    Remove
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <PlaylistCover playlist={playlist} mosaicTracks={mosaicTracks} />
                <button
                  type="button"
                  className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100"
                  onClick={handlePlayAll}
                  aria-label={`Play ${playlist.name}`}
                >
                  <svg className="h-10 w-10 drop-shadow-md" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                    <path d="M8 6v12l10-6-10-6z" />
                  </svg>
                </button>
              </>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              {editing ? (
                <input
                  className="min-w-0 flex-1 border-b-2 border-flaque-sand bg-transparent font-display text-2xl text-flaque-ink outline-none transition focus:border-flaque-ink"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={saving}
                  autoFocus
                />
              ) : (
                <h2 className="font-display text-2xl text-flaque-ink">{playlist.name}</h2>
              )}
              {editing ? (
                <select
                  className={`shrink-0 cursor-pointer rounded-full border border-flaque-clay/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide outline-none transition ${
                    editVisibility === "public"
                      ? "bg-green-100 text-green-700"
                      : "bg-flaque-clay/30 text-flaque-steel"
                  }`}
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value as PlaylistVisibility)}
                  disabled={saving}
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>
              ) : (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  playlist.visibility === "public"
                    ? "bg-green-100 text-green-700"
                    : "bg-flaque-clay/30 text-flaque-steel"
                }`}>
                  {playlist.visibility}
                </span>
              )}
            </div>

            {editing ? (
              <textarea
                className="mt-1 w-full resize-none rounded-lg border border-flaque-clay/40 bg-transparent px-2 py-1 text-sm text-flaque-steel outline-none transition focus:border-flaque-ink/40"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Add a description..."
                rows={2}
                disabled={saving}
              />
            ) : playlist.description ? (
              <p className="mt-1 text-sm text-flaque-steel">{playlist.description}</p>
            ) : null}

            <p className="mt-2 text-sm text-flaque-steel">by {owner}</p>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-flaque-steel">
              <span>{(editing ? editTrackIds : playlist.trackIds).length} track{(editing ? editTrackIds : playlist.trackIds).length !== 1 ? "s" : ""}</span>
              {totalDuration > 0 && !editing ? <span>{formatDurationCompact(totalDuration)}</span> : null}
              {!editing && playlist.listenCount > 0 ? (
                <span className="flex items-center gap-0.5">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {playlist.listenCount}
                </span>
              ) : null}
              {!editing && canHeart ? (
                <button
                  type="button"
                  className={`flex items-center gap-0.5 transition ${
                    hasHearted
                      ? "text-red-500 hover:text-red-600"
                      : "text-flaque-steel hover:text-red-400"
                  }`}
                  onClick={() => { void handleHeart(); }}
                  disabled={hearting}
                  aria-label={hasHearted ? "Remove heart" : "Heart playlist"}
                >
                  <svg className="h-3.5 w-3.5" fill={hasHearted ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  {playlist.heartCount > 0 ? playlist.heartCount : ""}
                </button>
              ) : !editing && playlist.heartCount > 0 ? (
                <span className="flex items-center gap-0.5 text-red-400">
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  {playlist.heartCount}
                </span>
              ) : null}
            </div>

            <CollaboratorsField
              editing={editing}
              isOwner={isOwner}
              saving={saving}
              collaborators={playlist.collaborators ?? []}
              editCollaboratorIds={editCollaboratorIds}
              onEditCollaboratorIdsChange={setEditCollaboratorIds}
              allUsers={allUsers}
              ownerNameById={ownerNameById}
              ownerId={playlist.authorId}
            />

            <PlaylistActions
              editing={editing}
              saving={saving}
              coverUploading={coverUploading}
              canEdit={canEdit}
              canManage={canManage}
              onPlayAll={handlePlayAll}
              onShufflePlay={handleShufflePlay}
              onStartEditing={startEditing}
              onSave={() => { void handleSave(); }}
              onCancel={cancelEditing}
              onDelete={() => { void handleDelete(); }}
            />
          </div>
        </div>
      </div>

      {editing ? (
        <PlaylistEditableTrackList
          trackIds={editTrackIds}
          allTracksById={allTracksById}
          saving={saving}
          onTrackIdsChange={setEditTrackIds}
        />
      ) : (
        <PlaylistTrackList tracks={tracks} onTrackPlay={handlePlayTrack} />
      )}
    </section>
  );
}
