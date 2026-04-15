import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Track, TrackMetadataPatch, User } from "../types";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayTitle
} from "../utils/tracks";
import { TrackDeleteModal } from "./TrackDeleteModal";
import { TrackEditModal } from "./TrackEditModal";
import type { EditTrackState } from "./TrackEditModal";

export type ConfigViewProps = {
  currentUser: User;
  tracks: Track[];
  ownerNameById?: Record<string, string>;
  loadingTracks: boolean;
  trackError: string | null;
  rebuilding: boolean;
  onRebuildIndex: () => Promise<void>;
  onRefreshTracks: () => Promise<void>;
  onDeleteTrack: (trackId: string) => Promise<void>;
  onUpdateTrackMetadata: (trackId: string, patch: TrackMetadataPatch) => Promise<void>;
  onBulkDeleteTracks: (trackIds: string[]) => Promise<void>;
  onBulkUpdateTrackMetadata: (trackIds: string[], patch: TrackMetadataPatch) => Promise<void>;
  activeSection: ConfigSection;
  onSectionChange: (section: ConfigSection) => void;
};

export type ConfigSection = "index" | "files" | "users" | "server" | "backup" | "library";

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

type BulkEditState = {
  trackIds: string[];
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  commonTitle: string | undefined;
  commonArtist: string | undefined;
  commonAlbum: string | undefined;
  commonYear: string | undefined;
  commonGenre: string | undefined;
};

function computeCommonField(tracks: Track[], getter: (t: Track) => string | undefined): string | undefined {
  if (tracks.length === 0) return undefined;
  const first = getter(tracks[0]);
  return tracks.every((t) => getter(t) === first) ? first : undefined;
}

export function ConfigView({
  tracks,
  ownerNameById,
  loadingTracks,
  trackError,
  rebuilding,
  onRebuildIndex,
  onRefreshTracks,
  onDeleteTrack,
  onUpdateTrackMetadata,
  onBulkDeleteTracks,
  onBulkUpdateTrackMetadata,
  activeSection
}: ConfigViewProps): JSX.Element {
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [activeTrackActionId, setActiveTrackActionId] = useState<string | null>(null);
  const [deleteTrackCandidate, setDeleteTrackCandidate] = useState<Track | null>(null);
  const [deletingTrack, setDeletingTrack] = useState(false);
  const [editState, setEditState] = useState<EditTrackState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkEditState, setBulkEditState] = useState<BulkEditState | null>(null);
  const [bulkSavingEdit, setBulkSavingEdit] = useState(false);
  const [bulkSuccessMessage, setBulkSuccessMessage] = useState<string | null>(null);
  const bulkSuccessTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { clearTimeout(bulkSuccessTimerRef.current); };
  }, []);

  function showBulkSuccess(message: string): void {
    clearTimeout(bulkSuccessTimerRef.current);
    setBulkSuccessMessage(message);
    bulkSuccessTimerRef.current = setTimeout(() => setBulkSuccessMessage(null), 4000);
  }

  const resolveOwnerLabel = (owner: string): string => ownerNameById?.[owner] ?? owner;

  const filteredTracks = useMemo(() => {
    const query = normalizeSearch(searchText);
    if (!query) {
      return tracks;
    }

    return tracks.filter((track) => {
      const searchable = [
        getTrackDisplayTitle(track),
        getTrackDisplayArtist(track),
        getTrackDisplayAlbumWithYear(track),
        track.tags.date,
        track.tags.originalDate,
        track.owner,
        resolveOwnerLabel(track.owner),
        track.path,
        track.codec
      ]
        .map((value) => normalizeSearch(value ?? ""))
        .join(" ");

      return searchable.includes(query);
    });
  }, [tracks, searchText, ownerNameById]);

  const totalPages = Math.max(1, Math.ceil(filteredTracks.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginatedTracks = filteredTracks.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function openDeleteTrackModal(track: Track): void {
    setDeleteTrackCandidate(track);
  }

  function closeDeleteTrackModal(): void {
    if (deletingTrack) {
      return;
    }

    setDeleteTrackCandidate(null);
  }

  async function handleDeleteTrack(track: Track): Promise<void> {
    setActiveTrackActionId(track.id);
    setDeletingTrack(true);

    try {
      await onDeleteTrack(track.id);
      setDeleteTrackCandidate(null);
    } catch (error) {
      void error;
    } finally {
      setActiveTrackActionId(null);
      setDeletingTrack(false);
    }
  }

  function openEditModal(track: Track): void {
    setEditState({
      track,
      title: track.tags.title ?? "",
      artist: track.tags.artist ?? "",
      album: track.tags.album ?? "",
      year: track.tags.year != null ? String(track.tags.year) : "",
      genre: track.tags.genre?.join(", ") ?? ""
    });
  }

  function closeEditModal(): void {
    if (savingEdit) {
      return;
    }
    setEditState(null);
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editState) {
      return;
    }

    setSavingEdit(true);

    try {
      const yearValue = editState.year.trim();
      const parsedYear = yearValue ? Number(yearValue) : null;

      const genreValue = editState.genre.trim();
      const parsedGenre: string[] | null = genreValue
        ? genreValue.split(",").map((g) => g.trim()).filter(Boolean)
        : null;

      await onUpdateTrackMetadata(editState.track.id, {
        title: editState.title.trim() || null,
        artist: editState.artist.trim() || null,
        album: editState.album.trim() || null,
        year: Number.isInteger(parsedYear) ? parsedYear : parsedYear === null ? null : undefined,
        genre: parsedGenre && parsedGenre.length > 0 ? parsedGenre : parsedGenre === null ? null : undefined
      });
      setEditState(null);
    } catch (error) {
      void error;
    } finally {
      setSavingEdit(false);
    }
  }

  const toggleTrackSelection = useCallback((trackId: string) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  }, []);

  const togglePageSelection = useCallback(() => {
    setSelectedTrackIds((prev) => {
      const pageIds = paginatedTracks.map((t) => t.id);
      const allPageSelected = pageIds.length > 0 && pageIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }, [paginatedTracks]);

  const clearSelection = useCallback(() => setSelectedTrackIds(new Set()), []);

  const selectedTracks = useMemo(
    () => tracks.filter((t) => selectedTrackIds.has(t.id)),
    [tracks, selectedTrackIds]
  );

  const pageAllSelected = paginatedTracks.length > 0 && paginatedTracks.every((t) => selectedTrackIds.has(t.id));
  const pageSomeSelected = paginatedTracks.some((t) => selectedTrackIds.has(t.id));

  function openBulkEditModal(): void {
    const selected = selectedTracks;
    if (selected.length === 0) return;

    const commonTitle = computeCommonField(selected, (t) => t.tags.title);
    const commonArtist = computeCommonField(selected, (t) => t.tags.artist);
    const commonAlbum = computeCommonField(selected, (t) => t.tags.album);
    const commonYear = computeCommonField(selected, (t) => t.tags.year != null ? String(t.tags.year) : undefined);
    const commonGenre = computeCommonField(selected, (t) => t.tags.genre?.join(", "));

    setBulkEditState({
      trackIds: selected.map((t) => t.id),
      title: commonTitle ?? "",
      artist: commonArtist ?? "",
      album: commonAlbum ?? "",
      year: commonYear ?? "",
      genre: commonGenre ?? "",
      commonTitle,
      commonArtist,
      commonAlbum,
      commonYear,
      commonGenre
    });
  }

  async function handleBulkEditSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!bulkEditState) return;

    const patch: TrackMetadataPatch = {};
    if (bulkEditState.title !== (bulkEditState.commonTitle ?? "")) {
      patch.title = bulkEditState.title.trim() || null;
    }
    if (bulkEditState.artist !== (bulkEditState.commonArtist ?? "")) {
      patch.artist = bulkEditState.artist.trim() || null;
    }
    if (bulkEditState.album !== (bulkEditState.commonAlbum ?? "")) {
      patch.album = bulkEditState.album.trim() || null;
    }
    if (bulkEditState.year !== (bulkEditState.commonYear ?? "")) {
      const yearValue = bulkEditState.year.trim();
      const parsedYear = yearValue ? Number(yearValue) : null;
      patch.year = Number.isInteger(parsedYear) ? parsedYear : parsedYear === null ? null : undefined;
    }
    if (bulkEditState.genre !== (bulkEditState.commonGenre ?? "")) {
      const genreValue = bulkEditState.genre.trim();
      patch.genre = genreValue
        ? genreValue.split(",").map((g) => g.trim()).filter(Boolean)
        : null;
    }

    const hasChanges = "title" in patch || "artist" in patch || "album" in patch || "year" in patch || "genre" in patch;
    if (!hasChanges) {
      setBulkEditState(null);
      return;
    }

    setBulkSavingEdit(true);
    try {
      const count = bulkEditState.trackIds.length;
      await onBulkUpdateTrackMetadata(bulkEditState.trackIds, patch);
      setBulkEditState(null);
      clearSelection();
      showBulkSuccess(`Metadata updated for ${count} track${count !== 1 ? "s" : ""}.`);
    } catch (error) {
      void error;
    } finally {
      setBulkSavingEdit(false);
    }
  }

  async function handleBulkDelete(): Promise<void> {
    const ids = Array.from(selectedTrackIds);
    if (ids.length === 0) return;

    setBulkDeleting(true);
    try {
      const count = ids.length;
      await onBulkDeleteTracks(ids);
      setBulkDeleteConfirm(false);
      clearSelection();
      showBulkSuccess(`${count} track${count !== 1 ? "s" : ""} deleted from the library.`);
    } catch (error) {
      void error;
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {trackError ? (
        <p
          className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="status"
          aria-live="polite"
        >
          {trackError}
        </p>
      ) : null}

      {activeSection === "index" ? (
        <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
          <h3 className="font-display text-xl text-flaque-ink">Index operations</h3>
          <p className="mt-2 text-sm text-flaque-steel">
            Keep the search index synchronized with the file system and refresh global file listings.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                void onRefreshTracks();
              }}
              disabled={loadingTracks}
            >
              {loadingTracks ? "Refreshing tracks..." : "Refresh files"}
            </button>
            <button
              className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                void onRebuildIndex();
              }}
              disabled={rebuilding}
            >
              {rebuilding ? "Rebuilding index..." : "Rebuild index"}
            </button>
          </div>
        </section>
      ) : null}

      {activeSection === "files" ? (
        <section className="flex flex-col rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm lg:h-[calc(100vh-6rem)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl text-flaque-ink">Global file management</h3>
            <p className="text-sm text-flaque-steel">
              {filteredTracks.length} / {tracks.length} track{tracks.length !== 1 ? "s" : ""}
            </p>
          </div>

          <input
            className="w-full max-w-sm rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="search"
            placeholder="Search by title, file name, artist, path"
            value={searchText}
            onChange={(event) => { setSearchText(event.target.value); setPage(0); }}
          />
        </div>

        {selectedTrackIds.size > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-flaque-clay/60 bg-flaque-cream/60 px-4 py-2.5">
            <span className="text-sm font-medium text-flaque-ink">
              {selectedTrackIds.size} selected
            </span>
            <button
              className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream"
              type="button"
              onClick={openBulkEditModal}
            >
              Edit metadata
            </button>
            <button
              className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-50"
              type="button"
              onClick={() => setBulkDeleteConfirm(true)}
            >
              Delete files
            </button>
            <button
              className="ml-auto rounded-lg px-3 py-1.5 text-xs text-flaque-steel transition hover:text-flaque-ink"
              type="button"
              onClick={clearSelection}
            >
              Clear selection
            </button>
          </div>
        ) : null}

        {bulkSuccessMessage ? (
          <div
            className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800"
            role="status"
            aria-live="polite"
          >
            {bulkSuccessMessage}
          </div>
        ) : null}

        <div className="mt-4 space-y-3 lg:hidden">
          {paginatedTracks.map((track) => {
            const runningAction = activeTrackActionId === track.id;
            const title = getTrackDisplayTitle(track);
            const isSelected = selectedTrackIds.has(track.id);

            return (
              <article key={track.id} className={`rounded-2xl border p-3 ${isSelected ? "border-flaque-ink/40 bg-flaque-cream/70" : "border-flaque-clay/60 bg-flaque-cream/45"}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-flaque-clay text-flaque-ink"
                    checked={isSelected}
                    onChange={() => toggleTrackSelection(track.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-flaque-ink" title={title}>
                      {title}
                    </p>
                    <p className="mt-1 truncate text-xs text-flaque-steel">
                      {getTrackDisplayArtist(track) ?? "Unknown"}
                      {getTrackDisplayAlbumWithYear(track) ? ` - ${getTrackDisplayAlbumWithYear(track)}` : ""}
                    </p>
                    <p className="mt-1 truncate font-mono text-[11px] text-flaque-steel/80" title={track.path}>
                      {track.path}
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        disabled={runningAction}
                        onClick={() => openEditModal(track)}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        type="button"
                        disabled={runningAction}
                        onClick={() => openDeleteTrackModal(track)}
                      >
                        Delete file
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {filteredTracks.length === 0 ? <p className="text-sm text-flaque-steel">No tracks match this search.</p> : null}
        </div>

        <div className="mt-4 hidden min-h-0 flex-1 overflow-auto rounded-2xl border border-flaque-clay/40 lg:block">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-flaque-clay text-flaque-ink"
                    checked={pageAllSelected}
                    ref={(el) => { if (el) el.indeterminate = pageSomeSelected && !pageAllSelected; }}
                    onChange={togglePageSelection}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Artist</th>
                <th className="px-4 py-3 font-medium">Album</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Path</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTracks.map((track) => {
                const runningAction = activeTrackActionId === track.id;
                const title = getTrackDisplayTitle(track);
                const isSelected = selectedTrackIds.has(track.id);

                return (
                  <tr key={track.id} className={`border-t border-flaque-clay/40 ${isSelected ? "bg-flaque-cream/60" : ""}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-flaque-clay text-flaque-ink"
                        checked={isSelected}
                        onChange={() => toggleTrackSelection(track.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-flaque-ink">
                      <span className="block max-w-[20rem] truncate" title={title}>
                        {title}
                      </span>
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-flaque-steel" title={getTrackDisplayArtist(track) ?? "Unknown"}>{getTrackDisplayArtist(track) ?? "Unknown"}</td>
                    <td className="max-w-[14rem] truncate px-4 py-3 text-flaque-steel" title={getTrackDisplayAlbumWithYear(track) ?? "Unknown"}>{getTrackDisplayAlbumWithYear(track) ?? "Unknown"}</td>
                    <td className="max-w-[8rem] truncate px-4 py-3 text-flaque-steel" title={resolveOwnerLabel(track.owner)}>{resolveOwnerLabel(track.owner)}</td>
                    <td className="max-w-[14rem] truncate px-4 py-3 font-mono text-xs text-flaque-steel" title={track.path}>{track.path}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          disabled={runningAction}
                          onClick={() => openEditModal(track)}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          disabled={runningAction}
                          onClick={() => {
                            openDeleteTrackModal(track);
                          }}
                        >
                          Delete file
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredTracks.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-flaque-steel" colSpan={7}>
                    No tracks match this search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="mt-3 flex shrink-0 items-center justify-between text-sm text-flaque-steel">
            <span>
              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filteredTracks.length)} of {filteredTracks.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-lg border border-flaque-clay/60 bg-flaque-cream/80 px-3 py-1 text-xs font-medium text-flaque-ink transition hover:bg-flaque-cream disabled:opacity-40"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                Previous
              </button>
              <span className="px-2 text-xs">
                {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                className="rounded-lg border border-flaque-clay/60 bg-flaque-cream/80 px-3 py-1 text-xs font-medium text-flaque-ink transition hover:bg-flaque-cream disabled:opacity-40"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage(safePage + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
        </section>
      ) : null}

      {editState ? (
        <TrackEditModal
          editState={editState}
          onSubmit={handleEditSubmit}
          onClose={closeEditModal}
          saving={savingEdit}
          onStateChange={setEditState}
        />
      ) : null}

      {deleteTrackCandidate ? (
        <TrackDeleteModal
          track={deleteTrackCandidate}
          onConfirm={() => {
            void handleDeleteTrack(deleteTrackCandidate);
          }}
          onClose={closeDeleteTrackModal}
          deleting={deletingTrack}
        />
      ) : null}

      {bulkDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-3xl border border-flaque-clay/60 bg-white p-5 shadow-panel">
            <h3 className="font-display text-xl text-flaque-ink">Delete {selectedTrackIds.size} files</h3>
            <p className="mt-2 text-sm text-red-700">
              This action cannot be undone. <strong>{selectedTrackIds.size} file{selectedTrackIds.size !== 1 ? "s" : ""}</strong> will
              be permanently removed from storage.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => setBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                disabled={bulkDeleting}
                onClick={() => { void handleBulkDelete(); }}
              >
                {bulkDeleting ? "Deleting..." : `Delete ${selectedTrackIds.size} files`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkEditState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            className="w-full max-w-md rounded-3xl border border-flaque-clay/60 bg-white p-5 shadow-panel"
            onSubmit={(e) => { void handleBulkEditSubmit(e); }}
          >
            <h3 className="font-display text-xl text-flaque-ink">Edit {bulkEditState.trackIds.length} tracks</h3>
            <p className="mt-2 text-sm text-flaque-steel">
              Only fields you change will be updated. Unchanged fields keep their current values.
            </p>

            <label className="mt-4 block text-sm text-flaque-ink">
              Title
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                value={bulkEditState.title}
                placeholder={bulkEditState.commonTitle === undefined ? "Mixed values" : ""}
                onChange={(e) => setBulkEditState((s) => s ? { ...s, title: e.target.value } : s)}
              />
            </label>

            <label className="mt-3 block text-sm text-flaque-ink">
              Artist
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                value={bulkEditState.artist}
                placeholder={bulkEditState.commonArtist === undefined ? "Mixed values" : ""}
                onChange={(e) => setBulkEditState((s) => s ? { ...s, artist: e.target.value } : s)}
              />
            </label>

            <label className="mt-3 block text-sm text-flaque-ink">
              Album
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                value={bulkEditState.album}
                placeholder={bulkEditState.commonAlbum === undefined ? "Mixed values" : ""}
                onChange={(e) => setBulkEditState((s) => s ? { ...s, album: e.target.value } : s)}
              />
            </label>

            <label className="mt-3 block text-sm text-flaque-ink">
              Year
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                inputMode="numeric"
                value={bulkEditState.year}
                placeholder={bulkEditState.commonYear === undefined ? "Mixed values" : "e.g. 1979"}
                onChange={(e) => setBulkEditState((s) => s ? { ...s, year: e.target.value } : s)}
              />
            </label>

            <label className="mt-3 block text-sm text-flaque-ink">
              Genre
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                value={bulkEditState.genre}
                placeholder={bulkEditState.commonGenre === undefined ? "Mixed values" : "e.g. Rock, Progressive Rock"}
                onChange={(e) => setBulkEditState((s) => s ? { ...s, genre: e.target.value } : s)}
              />
              <span className="mt-0.5 block text-xs text-flaque-steel">Comma-separated</span>
            </label>

            <p className="mt-3 text-xs text-flaque-steel">
              Leave a field empty to clear override and fallback to embedded file metadata.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={() => setBulkEditState(null)}
                disabled={bulkSavingEdit}
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={bulkSavingEdit}
              >
                {bulkSavingEdit ? "Saving..." : `Save ${bulkEditState.trackIds.length} tracks`}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
