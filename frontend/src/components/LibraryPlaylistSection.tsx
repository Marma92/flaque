import { FormEvent, useEffect, useRef, useState } from "react";

import { coverUrl } from "../api";
import type { Playlist, PlaylistVisibility, Track } from "../types";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "../utils/tracks";

type LibraryPlaylistSectionProps = {
  availablePlaylists: Playlist[];
  manageablePlaylists: Playlist[];
  ownerNameById: Record<string, string>;
  allTracksById: Map<string, Track>;
  onCreatePlaylist: (input: { name: string; visibility: PlaylistVisibility }) => Promise<void>;
  onPlayPlaylist: (playlist: Playlist) => void;
  onPatchPlaylist: (playlistId: string, patch: { name?: string; visibility?: PlaylistVisibility; trackIds?: string[] }) => Promise<void>;
  onDeletePlaylist: (playlistId: string) => Promise<void>;
};

// ── Mosaic cover ────────────────────────────────────────────────────

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
    const track = tracks[0]!;
    return (
      <img
        src={coverUrl(track.id)}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
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
          />
        ) : (
          <div key={i} className="bg-flaque-clay/20" />
        )
      )}
    </div>
  );
}

// ── Dropdown menu ───────────────────────────────────────────────────

type PlaylistMenuProps = {
  canManage: boolean;
  onEdit: () => void;
  onDownload: () => void;
  onDelete: () => void;
};

function PlaylistMenu({ canManage, onEdit, onDownload, onDelete }: PlaylistMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-flaque-steel transition hover:bg-flaque-clay/30 hover:text-flaque-ink"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label="Playlist options"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>

      {open ? (
        <div className="absolute bottom-full right-0 z-20 mb-1 min-w-[160px] overflow-hidden rounded-xl border border-flaque-clay/60 bg-white shadow-lg">
          {canManage ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-flaque-ink transition hover:bg-flaque-cream"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }}
            >
              <svg className="h-4 w-4 shrink-0 text-flaque-steel" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit playlist
            </button>
          ) : null}
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-flaque-ink transition hover:bg-flaque-cream"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDownload(); }}
          >
            <svg className="h-4 w-4 shrink-0 text-flaque-steel" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download playlist
          </button>
          {canManage ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete playlist
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Edit modal ──────────────────────────────────────────────────────

type EditModalProps = {
  playlist: Playlist;
  allTracksById: Map<string, Track>;
  saving: boolean;
  onSave: (patch: { name?: string; trackIds?: string[] }) => Promise<void>;
  onClose: () => void;
};

function EditModal({ playlist, allTracksById, saving, onSave, onClose }: EditModalProps): JSX.Element {
  const [name, setName] = useState(playlist.name);
  const [trackIds, setTrackIds] = useState<string[]>([...playlist.trackIds]);

  function removeTrack(id: string): void {
    setTrackIds((prev) => prev.filter((t) => t !== id));
  }

  function moveTrack(index: number, direction: -1 | 1): void {
    const next = [...trackIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setTrackIds(next);
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    await onSave({ name: name.trim() || playlist.name, trackIds });
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
          <div className="px-5 pt-4">
            <label className="block text-sm font-medium text-flaque-ink">Name</label>
            <input
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="mt-4 flex-1 overflow-y-auto px-5">
            <p className="text-sm font-medium text-flaque-ink">
              Tracks <span className="text-flaque-steel">({trackIds.length})</span>
            </p>
            {trackIds.length === 0 ? (
              <p className="mt-2 text-sm text-flaque-steel">No tracks in this playlist.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {trackIds.map((id, index) => {
                  const track = allTracksById.get(id);
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-lg bg-flaque-cream/40 px-2 py-1.5">
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
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="rounded p-0.5 text-flaque-steel transition hover:text-flaque-ink disabled:opacity-30"
                          onClick={() => moveTrack(index, -1)}
                          disabled={index === 0 || saving}
                          aria-label="Move up"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="rounded p-0.5 text-flaque-steel transition hover:text-flaque-ink disabled:opacity-30"
                          onClick={() => moveTrack(index, 1)}
                          disabled={index === trackIds.length - 1 || saving}
                          aria-label="Move down"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="rounded p-0.5 text-red-400 transition hover:text-red-600 disabled:opacity-30"
                          onClick={() => removeTrack(id)}
                          disabled={saving}
                          aria-label="Remove track"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
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
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Playlist card ───────────────────────────────────────────────────

type PlaylistCardProps = {
  playlist: Playlist;
  canManage: boolean;
  allTracksById: Map<string, Track>;
  ownerNameById: Record<string, string>;
  onPlay: () => void;
  onPatch: (patch: { name?: string; trackIds?: string[] }) => Promise<void>;
  onDelete: () => void;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function PlaylistCard({
  playlist,
  canManage,
  allTracksById,
  ownerNameById,
  onPlay,
  onPatch,
  onDelete
}: PlaylistCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const tracks = playlist.trackIds.map((id) => allTracksById.get(id)).filter((t): t is Track => t !== undefined);
  const mosaicTracks = getPlaylistMosaicTracks(playlist.trackIds, allTracksById);
  const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
  const owner = ownerNameById[playlist.authorId] ?? playlist.authorId;

  function downloadPlaylist(): void {
    const data = {
      id: playlist.id,
      name: playlist.name,
      visibility: playlist.visibility,
      tracks: tracks.map((t) => ({
        id: t.id,
        title: getTrackDisplayTitle(t),
        artist: getTrackDisplayArtist(t),
        album: t.tags.album,
        duration: t.duration
      }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${playlist.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSave(patch: { name?: string; trackIds?: string[] }): Promise<void> {
    setSaving(true);
    try {
      await onPatch(patch);
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-flaque-clay/60 bg-white/85 shadow-sm">
        {/* Header row — cover + info + buttons */}
        <div
          className="flex cursor-pointer items-center gap-3 p-3 transition hover:bg-flaque-cream/50"
          onClick={() => setExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v); }}
          aria-expanded={expanded}
        >
          {/* Mosaic */}
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl">
            <PlaylistMosaic tracks={mosaicTracks} />
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-flaque-ink">{playlist.name}</p>
            <p className="truncate text-xs text-flaque-steel">
              {playlist.trackIds.length} track{playlist.trackIds.length !== 1 ? "s" : ""}
              {totalDuration > 0 ? ` · ${formatDuration(totalDuration)}` : ""}
              {" · "}{owner}
            </p>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-flaque-ink text-white transition hover:bg-black"
              onClick={onPlay}
              aria-label={`Play ${playlist.name}`}
            >
              <svg className="h-4 w-4 translate-x-px" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>

            <PlaylistMenu
              canManage={canManage}
              onEdit={() => setEditOpen(true)}
              onDownload={downloadPlaylist}
              onDelete={onDelete}
            />

            {/* Chevron */}
            <svg
              className={`h-4 w-4 shrink-0 text-flaque-steel/60 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Expanded track list */}
        {expanded ? (
          <div className="border-t border-flaque-clay/30">
            {tracks.length === 0 ? (
              <p className="px-4 py-3 text-sm text-flaque-steel">No playable tracks.</p>
            ) : (
              <ul>
                {tracks.map((track, index) => (
                  <li
                    key={track.id}
                    className="flex items-center gap-3 border-b border-flaque-clay/20 px-3 py-2 last:border-b-0"
                  >
                    <span className="w-5 shrink-0 text-right text-xs text-flaque-steel/50">{index + 1}</span>
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md">
                      <img src={coverUrl(track.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-flaque-ink">
                        {getTrackDisplayTitle(track)}
                      </p>
                      <p className="truncate text-[10px] text-flaque-steel">
                        {getTrackDisplayArtist(track) ?? "Unknown artist"}
                        {track.tags.album ? ` · ${track.tags.album}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {track.tags.extra?.lyrics ? (
                        <span className="rounded px-1 py-px font-mono text-[9px] font-bold leading-none text-flaque-steel/70 ring-1 ring-flaque-clay/60">
                          L
                        </span>
                      ) : null}
                      <span className="font-mono text-[10px] text-flaque-steel/60">
                        {formatDuration(track.duration)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {editOpen ? (
        <EditModal
          playlist={playlist}
          allTracksById={allTracksById}
          saving={saving}
          onSave={handleSave}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </>
  );
}

// ── Main section ────────────────────────────────────────────────────

export function LibraryPlaylistSection({
  availablePlaylists,
  manageablePlaylists,
  ownerNameById,
  allTracksById,
  onCreatePlaylist,
  onPlayPlaylist,
  onPatchPlaylist,
  onDeletePlaylist
}: LibraryPlaylistSectionProps): JSX.Element {
  const [playlistName, setPlaylistName] = useState("");
  const [playlistVisibility, setPlaylistVisibility] = useState<PlaylistVisibility>("private");
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const manageableIds = new Set(manageablePlaylists.map((p) => p.id));

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setStatusMessage(null);
    try {
      await onCreatePlaylist({ name: playlistName, visibility: playlistVisibility });
      setPlaylistName("");
      setStatusMessage("Playlist created.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to create playlist");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h2 className="font-display text-xl text-flaque-ink">Playlists</h2>

      <form
        className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
        onSubmit={(event) => { void handleSubmit(event); }}
      >
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
          {submitting ? "Creating…" : "Create"}
        </button>
      </form>

      {statusMessage ? <p className="mt-2 text-sm text-flaque-steel">{statusMessage}</p> : null}

      <div className="mt-5 space-y-2">
        {availablePlaylists.length === 0 ? (
          <p className="text-sm text-flaque-steel">No playlists yet.</p>
        ) : (
          availablePlaylists.map((playlist) => (
            <PlaylistCard
              key={playlist.id}
              playlist={playlist}
              canManage={manageableIds.has(playlist.id)}
              allTracksById={allTracksById}
              ownerNameById={ownerNameById}
              onPlay={() => onPlayPlaylist(playlist)}
              onPatch={(patch) => onPatchPlaylist(playlist.id, patch)}
              onDelete={() => { void onDeletePlaylist(playlist.id); }}
            />
          ))
        )}
      </div>
    </section>
  );
}
