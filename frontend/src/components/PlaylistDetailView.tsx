import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import defaultCoverImage from "../assets/default-cover.png";
import { coverUrl, deletePlaylistCover, getUsers, playlistCoverUrl, uploadPlaylistCover } from "../api";
import type { Playlist, PlaylistVisibility, Track, User } from "../types";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "../utils/tracks";

export type PlaylistDetailViewProps = {
  playlistId: string;
  availablePlaylists: Playlist[];
  manageablePlaylists: Playlist[];
  allTracksById: Map<string, Track>;
  ownerNameById: Record<string, string>;
  user: User;
  onBack: () => void;
  onPlay: (playlist: Playlist) => void;
  onPlayTrack?: (track: Track, queueSource: Track[]) => void;
  onPatch: (playlistId: string, patch: { name?: string; visibility?: PlaylistVisibility; trackIds?: string[]; description?: string; collaborators?: string[] }) => Promise<Playlist>;
  onNavigate: (playlistId: string) => void;
  onDelete: (playlistId: string) => Promise<void>;
  onHeart: (playlistId: string) => Promise<{ hearted: boolean; heartCount: number }>;
  onReportListen: (playlistId: string) => Promise<void>;
};

// ── Helpers ────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

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

// ── Large cover display ────────────────────────────────────────────

function PlaylistCover({ playlist, mosaicTracks }: { playlist: Playlist; mosaicTracks: Track[] }): JSX.Element {
  if (playlist.cover) {
    return (
      <img
        src={playlistCoverUrl(playlist.id)}
        alt={playlist.name}
        className="h-full w-full rounded-2xl object-cover"
      />
    );
  }

  const slots = Array.from({ length: 4 }, (_, i) => mosaicTracks[i] ?? null);

  if (mosaicTracks.length === 0) {
    return (
      <img src={defaultCoverImage} alt="" className="h-full w-full rounded-2xl object-cover" />
    );
  }

  if (mosaicTracks.length === 1) {
    return (
      <img
        src={coverUrl(mosaicTracks[0]!.id)}
        alt=""
        className="h-full w-full rounded-2xl object-cover"
        onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
      />
    );
  }

  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2 overflow-hidden rounded-2xl">
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

// ── Sortable track item (reused for inline edit) ──────────────────

function SortableTrackItem({
  id,
  track,
  saving,
  onRemove
}: {
  id: string;
  track: Track | undefined;
  saving: boolean;
  onRemove: (id: string) => void;
}): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? "relative" as const : undefined
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg bg-flaque-cream/40 px-2 py-1.5 ${
        isDragging ? "shadow-lg ring-2 ring-flaque-sand/60" : ""
      }`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="shrink-0 cursor-grab touch-none rounded p-0.5 text-flaque-steel/50 transition hover:text-flaque-ink active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>

      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md">
        {track ? (
          <img
            src={coverUrl(track.id)}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
          />
        ) : (
          <img src={defaultCoverImage} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-flaque-ink">
          {track ? getTrackDisplayTitle(track) : id}
        </p>
        {track ? (
          <p className="truncate text-[10px] text-flaque-steel">
            {getTrackDisplayArtist(track) ?? "Unknown artist"}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-red-400 transition hover:text-red-600 disabled:opacity-30"
        onClick={() => onRemove(id)}
        disabled={saving}
        aria-label="Remove track"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}

// ── Main component ─────────────────────────────────────────────────

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

  // ── Edit state ──────────────────────────────────────────────────
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const isOwner = playlist ? playlist.authorId === user.id : false;

  const availableCollaborators = useMemo(() =>
    allUsers.filter((u) => u.id !== playlist?.authorId && !editCollaboratorIds.includes(u.id)),
    [allUsers, playlist?.authorId, editCollaboratorIds]
  );

  // ── Derived data ────────────────────────────────────────────────
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

  // Clean up cover preview URL on unmount
  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

  // ── Edit mode handlers ──────────────────────────────────────────

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

  function removeTrack(id: string): void {
    setEditTrackIds((prev) => prev.filter((t) => t !== id));
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEditTrackIds((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  // ── Playback handlers ──────────────────────────────────────────

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

  function handlePlayAll(): void {
    if (!playlist) return;
    if (!listenReportedRef.current) {
      listenReportedRef.current = true;
      void onReportListen(playlist.id);
    }
    onPlay(playlist);
  }

  function handlePlayTrack(track: Track): void {
    if (!playlist) return;
    if (!listenReportedRef.current) {
      listenReportedRef.current = true;
      void onReportListen(playlist.id);
    }
    if (onPlayTrack) {
      onPlayTrack(track, tracks);
    } else {
      const idx = tracks.indexOf(track);
      const reordered = [...tracks.slice(idx), ...tracks.slice(0, idx)];
      const syntheticPlaylist: Playlist = { ...playlist, trackIds: reordered.map((t) => t.id) };
      onPlay(syntheticPlaylist);
    }
  }

  function handleShufflePlay(): void {
    if (!playlist || tracks.length === 0) return;
    if (!listenReportedRef.current) {
      listenReportedRef.current = true;
      void onReportListen(playlist.id);
    }
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    const shuffledPlaylist: Playlist = { ...playlist, trackIds: shuffled.map((t) => t.id) };
    onPlay(shuffledPlaylist);
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

  // ── Cover display logic for edit mode ───────────────────────────
  const coverSrc = coverPreview
    ?? (coverRemoved ? null : (playlist.cover ? playlistCoverUrl(playlist.id) : null));

  return (
    <section className="m-4 space-y-4">
      {/* Back button */}
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

      {/* Hidden cover file input */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleCoverSelect}
        disabled={saving || coverUploading}
      />

      {/* Header */}
      <div className="rounded-2xl p-5">
        <div className="flex flex-col gap-5 sm:flex-row">
          {/* Cover */}
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

          {/* Info */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Title + visibility */}
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

            {/* Description */}
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

            {/* Stats line */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-flaque-steel">
              <span>{(editing ? editTrackIds : playlist.trackIds).length} track{(editing ? editTrackIds : playlist.trackIds).length !== 1 ? "s" : ""}</span>
              {totalDuration > 0 && !editing ? <span>{formatDuration(totalDuration)}</span> : null}
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

            {/* Collaborators */}
            {editing && isOwner ? (
              <div className="mt-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs text-flaque-steel">Collaborators:</span>
                  {editCollaboratorIds.includes("everyone") ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-yellow-600">
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2a10 10 0 100 20 10 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zM12 11a2 2 0 1000 4 2 2 0 000-4z"/>
                      </svg>
                      Everyone
                      <button
                        type="button"
                        className="ml-0.5 text-flaque-steel hover:text-red-500"
                        onClick={() => setEditCollaboratorIds((prev) => prev.filter((c) => c !== "everyone"))}
                        aria-label="Remove everyone"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ) : (
                    editCollaboratorIds.map((collab) => {
                      const u = allUsers.find((usr) => usr.id === collab);
                      return (
                        <span key={collab} className="inline-flex items-center gap-1 rounded-full bg-flaque-cream px-2 py-0.5 text-[10px] font-medium text-flaque-ink">
                          {u?.username ?? ownerNameById[collab] ?? collab}
                          <button
                            type="button"
                            className="text-flaque-steel hover:text-red-500"
                            onClick={() => setEditCollaboratorIds((prev) => prev.filter((c) => c !== collab))}
                            aria-label={`Remove ${u?.username ?? collab}`}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
                {availableCollaborators.length > 0 || !editCollaboratorIds.includes("everyone") ? (
                  <select
                    className="mt-1 rounded-lg border border-flaque-clay/40 bg-transparent px-2 py-1 text-xs text-flaque-ink outline-none transition focus:border-flaque-ink/40"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setEditCollaboratorIds((prev) => [...prev, e.target.value]);
                    }}
                    disabled={saving}
                  >
                    <option value="">Add collaborator...</option>
                    {!editCollaboratorIds.includes("everyone") ? (
                      <option value="everyone">Everyone</option>
                    ) : null}
                    {availableCollaborators.map((u) => (
                      <option key={u.id} value={u.id}>{u.username}</option>
                    ))}
                  </select>
                ) : null}
              </div>
            ) : (playlist.collaborators ?? []).length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-xs text-flaque-steel">Collaborators:</span>
                {(playlist.collaborators ?? []).includes("everyone") ? (
                  <span className="flex items-center gap-0.5 text-[10px] text-yellow-600">
                    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2a10 10 0 100 20 10 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zM12 11a2 2 0 1000 4 2 2 0 000-4z"/>
                    </svg>
                    Everyone
                  </span>
                ) : (
                  (playlist.collaborators ?? []).map((collab) => (
                    <span key={collab} className="rounded-full bg-flaque-cream px-2 py-0.5 text-[10px] font-medium text-flaque-ink">
                      {ownerNameById[collab] ?? collab}
                    </span>
                  ))
                )}
              </div>
            ) : null}

            {/* Action buttons */}
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
              {editing ? (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:opacity-60"
                    onClick={() => { void handleSave(); }}
                    disabled={saving || coverUploading}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {coverUploading ? "Uploading cover..." : saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-xl border border-flaque-clay px-4 py-2 text-sm text-flaque-steel transition hover:bg-flaque-cream"
                    onClick={cancelEditing}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
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

                  {canEdit ? (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-xl border border-flaque-clay px-3 py-2 text-sm text-flaque-steel transition hover:bg-flaque-cream hover:text-flaque-ink"
                      onClick={startEditing}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit
                    </button>
                  ) : null}

                  {canManage ? (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-500 transition hover:bg-red-50 hover:text-red-600"
                      onClick={() => { void handleDelete(); }}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Track list */}
      {editing ? (
        <div className="rounded-2xl border border-flaque-clay/60 bg-white/85 shadow-panel backdrop-blur-sm">
          <div className="px-4 pt-3 pb-1">
            <p className="text-sm font-medium text-flaque-ink">
              Tracks <span className="text-flaque-steel">({editTrackIds.length})</span>
            </p>
          </div>
          {editTrackIds.length === 0 ? (
            <p className="px-5 py-4 text-sm text-flaque-steel">No tracks in this playlist.</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={editTrackIds} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1 p-3">
                  {editTrackIds.map((id) => (
                    <SortableTrackItem
                      key={id}
                      id={id}
                      track={allTracksById.get(id)}
                      saving={saving}
                      onRemove={removeTrack}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-flaque-clay/60 bg-white/85 shadow-panel backdrop-blur-sm">
          {tracks.length === 0 ? (
            <p className="px-5 py-4 text-sm text-flaque-steel">No playable tracks.</p>
          ) : (
            <ul>
              {tracks.map((track, index) => (
                <li
                  key={track.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-flaque-clay/20 px-4 py-2.5 last:border-b-0 transition hover:bg-flaque-cream/30"
                  onClick={() => handlePlayTrack(track)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") handlePlayTrack(track); }}
                >
                  <span className="w-6 shrink-0 text-right text-xs text-flaque-steel/50">{index + 1}</span>
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                    <img
                      src={coverUrl(track.id)}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={(e) => { e.currentTarget.src = defaultCoverImage; }}
                    />
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
      )}
    </section>
  );
}
