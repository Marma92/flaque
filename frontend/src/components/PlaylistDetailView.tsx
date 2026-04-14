import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

import { coverUrl, playlistCoverUrl } from "../api";
import type { Playlist, PlaylistVisibility, Track, User } from "../types";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "../utils/tracks";

type PlaylistDetailViewProps = {
  playlistId: string;
  availablePlaylists: Playlist[];
  manageablePlaylists: Playlist[];
  allTracksById: Map<string, Track>;
  ownerNameById: Record<string, string>;
  user: User;
  onBack: () => void;
  onPlay: (playlist: Playlist) => void;
  onPatch: (playlistId: string, patch: { name?: string; visibility?: PlaylistVisibility; trackIds?: string[]; description?: string }) => Promise<void>;
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
      <div className="flex h-full w-full items-center justify-center rounded-2xl bg-flaque-clay/20">
        <svg className="h-16 w-16 text-flaque-steel/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
    );
  }

  if (mosaicTracks.length === 1) {
    return (
      <img
        src={coverUrl(mosaicTracks[0]!.id)}
        alt=""
        className="h-full w-full rounded-2xl object-cover"
      />
    );
  }

  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2 overflow-hidden rounded-2xl">
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

// ── Edit modal ─────────────────────────────────────────────────────

type EditModalProps = {
  playlist: Playlist;
  allTracksById: Map<string, Track>;
  saving: boolean;
  onSave: (patch: { name?: string; trackIds?: string[]; description?: string }) => Promise<void>;
  onClose: () => void;
};

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
          <img src={coverUrl(track.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full bg-flaque-clay/30" />
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

function EditModal({ playlist, allTracksById, saving, onSave, onClose }: EditModalProps): JSX.Element {
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description);
  const [trackIds, setTrackIds] = useState<string[]>([...playlist.trackIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function removeTrack(id: string): void {
    setTrackIds((prev) => prev.filter((t) => t !== id));
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setTrackIds((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    await onSave({
      name: name.trim() || playlist.name,
      description: description.trim(),
      trackIds
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-flaque-clay/60 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-flaque-clay/30 px-5 py-4">
          <h3 className="font-display text-lg text-flaque-ink">Edit playlist</h3>
          <button
            type="button"
            className="rounded-lg p-1 text-flaque-steel transition hover:bg-flaque-cream hover:text-flaque-ink"
            onClick={onClose}
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form className="flex flex-1 flex-col overflow-hidden" onSubmit={(e) => { void handleSubmit(e); }}>
          <div className="space-y-3 px-5 pt-4">
            <div>
              <label className="block text-sm font-medium text-flaque-ink">Name</label>
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-flaque-ink">Description</label>
              <textarea
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={saving}
                placeholder="Add a description..."
              />
            </div>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto px-5">
            <p className="text-sm font-medium text-flaque-ink">
              Tracks <span className="text-flaque-steel">({trackIds.length})</span>
            </p>
            {trackIds.length === 0 ? (
              <p className="mt-2 text-sm text-flaque-steel">No tracks in this playlist.</p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={trackIds} strategy={verticalListSortingStrategy}>
                  <ul className="mt-2 space-y-1">
                    {trackIds.map((id) => (
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

          <div className="flex justify-end gap-2 border-t border-flaque-clay/30 px-5 py-4">
            <button
              type="button"
              className="rounded-xl border border-flaque-clay px-4 py-2 text-sm text-flaque-steel transition hover:bg-flaque-cream"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
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
  onPatch,
  onDelete,
  onHeart,
  onReportListen
}: PlaylistDetailViewProps): JSX.Element {
  const playlist = availablePlaylists.find((p) => p.id === playlistId);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hearting, setHearting] = useState(false);
  const listenReportedRef = useRef(false);

  const canManage = useMemo(() => {
    if (!playlist) return false;
    return manageablePlaylists.some((p) => p.id === playlist.id);
  }, [playlist, manageablePlaylists]);

  const canEdit = useMemo(() => {
    if (!playlist) return false;
    return canManage || playlist.collaborators.includes(user.id);
  }, [playlist, canManage, user.id]);

  const canHeart = useMemo(() => {
    if (!playlist) return false;
    return playlist.visibility === "public" && playlist.authorId !== user.id;
  }, [playlist, user.id]);

  const hasHearted = useMemo(() => {
    if (!playlist) return false;
    return playlist.hearts.includes(user.id);
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

  async function handleSave(patch: { name?: string; trackIds?: string[]; description?: string }): Promise<void> {
    setSaving(true);
    try {
      await onPatch(playlist!.id, patch);
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    await onDelete(playlist!.id);
    onBack();
  }

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
      <div className="rounded-2xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-col gap-5 sm:flex-row">
          {/* Cover */}
          <div className="h-48 w-48 shrink-0 self-center overflow-hidden sm:self-start">
            <PlaylistCover playlist={playlist} mosaicTracks={mosaicTracks} />
          </div>

          {/* Info */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start gap-2">
              <h2 className="font-display text-2xl text-flaque-ink">{playlist.name}</h2>
              <span className={`mt-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                playlist.visibility === "public"
                  ? "bg-green-100 text-green-700"
                  : "bg-flaque-clay/30 text-flaque-steel"
              }`}>
                {playlist.visibility}
              </span>
            </div>

            {playlist.description ? (
              <p className="mt-1 text-sm text-flaque-steel">{playlist.description}</p>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-flaque-steel">
              <span>by {owner}</span>
              <span>{playlist.trackIds.length} track{playlist.trackIds.length !== 1 ? "s" : ""}</span>
              {totalDuration > 0 ? <span>{formatDuration(totalDuration)}</span> : null}
              {playlist.listenCount > 0 ? (
                <span className="flex items-center gap-0.5">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {playlist.listenCount}
                </span>
              ) : null}
            </div>

            {playlist.collaborators.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-xs text-flaque-steel">Collaborators:</span>
                {playlist.collaborators.map((collab) => (
                  <span key={collab} className="rounded-full bg-flaque-cream px-2 py-0.5 text-[10px] font-medium text-flaque-ink">
                    {ownerNameById[collab] ?? collab}
                  </span>
                ))}
              </div>
            ) : null}

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

              {canHeart ? (
                <button
                  type="button"
                  className={`flex items-center gap-1 rounded-xl border px-3 py-2 text-sm transition ${
                    hasHearted
                      ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                      : "border-flaque-clay text-flaque-steel hover:bg-flaque-cream hover:text-flaque-ink"
                  }`}
                  onClick={() => { void handleHeart(); }}
                  disabled={hearting}
                >
                  <svg className="h-4 w-4" fill={hasHearted ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  {playlist.heartCount > 0 ? playlist.heartCount : ""}
                </button>
              ) : playlist.heartCount > 0 ? (
                <span className="flex items-center gap-1 text-xs text-flaque-steel">
                  <svg className="h-3.5 w-3.5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  {playlist.heartCount}
                </span>
              ) : null}

              {canEdit ? (
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-xl border border-flaque-clay px-3 py-2 text-sm text-flaque-steel transition hover:bg-flaque-cream hover:text-flaque-ink"
                  onClick={() => setEditOpen(true)}
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

      {/* Edit modal */}
      {editOpen ? (
        <EditModal
          playlist={playlist}
          allTracksById={allTracksById}
          saving={saving}
          onSave={handleSave}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </section>
  );
}
