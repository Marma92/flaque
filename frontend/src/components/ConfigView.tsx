import { FormEvent, useMemo, useState } from "react";

import type { BackupConfig, BackupEntry, LogFile, LogEntry, StorageUsage, VersionInfo, UpdateStatus } from "../api";
import type { Track, TrackMetadataPatch, User } from "../types";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayTitle
} from "../utils/tracks";
import { AdminBackupView } from "./AdminBackupView";
import { AdminServerView } from "./AdminServerView";
import { AdminUsersView } from "./AdminUsersView";
import { TrackDeleteModal } from "./TrackDeleteModal";
import { TrackEditModal } from "./TrackEditModal";
import type { EditTrackState } from "./TrackEditModal";

type ConfigViewProps = {
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
  users: User[];
  loadingUsers: boolean;
  usersError: string | null;
  onRefreshUsers: () => Promise<void>;
  onCreateUser: (input: {
    username: string;
    password: string;
    email: string;
    role: "user" | "admin";
  }) => Promise<void>;
  onPatchUser: (input: {
    userId: string;
    username?: string;
    email?: string;
    role?: "user" | "admin";
  }) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onResetUserPassword: (userId: string, password: string) => Promise<void>;
  versionInfo: VersionInfo | null;
  loadingVersion: boolean;
  updateStatus: UpdateStatus | null;
  onTriggerUpdate: () => Promise<void>;
  storageUsage: StorageUsage | null;
  loadingStorage: boolean;
  logFiles: LogFile[];
  loadingLogFiles: boolean;
  selectedLogFile: string | null;
  onLogFileChange: (file: string) => void;
  logEntries: LogEntry[];
  loadingLogEntries: boolean;
  logsError: string | null;
  logTotal: number;
  logLevelFilter: number | null;
  onLogLevelFilterChange: (level: number | null) => void;
  onRefreshLogs: () => Promise<void>;
  onLoadMoreLogs: () => Promise<void>;
  hasMoreLogs: boolean;
  backups: BackupEntry[];
  loadingBackups: boolean;
  backupConfig: BackupConfig | null;
  loadingBackupConfig: boolean;
  backupError: string | null;
  backupMessage: string | null;
  creatingBackup: boolean;
  restoringBackup: boolean;
  onCreateBackup: () => Promise<void>;
  onDeleteBackup: (id: string) => Promise<void>;
  onRestoreBackup: (id: string) => Promise<void>;
  onUpdateBackupConfig: (config: Partial<BackupConfig>) => Promise<void>;
  onPurgeExpiredBackups: () => Promise<void>;
  onRefreshBackups: () => Promise<void>;
  activeSection: ConfigSection;
  onSectionChange: (section: ConfigSection) => void;
};

export type ConfigSection = "index" | "files" | "users" | "server" | "backup";

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

export function ConfigView({
  currentUser,
  tracks,
  ownerNameById,
  loadingTracks,
  trackError,
  rebuilding,
  onRebuildIndex,
  onRefreshTracks,
  onDeleteTrack,
  onUpdateTrackMetadata,
  users,
  loadingUsers,
  usersError,
  onRefreshUsers,
  onCreateUser,
  onPatchUser,
  onDeleteUser,
  onResetUserPassword,
  versionInfo,
  loadingVersion,
  updateStatus,
  onTriggerUpdate,
  storageUsage,
  loadingStorage,
  logFiles,
  loadingLogFiles,
  selectedLogFile,
  onLogFileChange,
  logEntries,
  loadingLogEntries,
  logsError,
  logTotal,
  logLevelFilter,
  onLogLevelFilterChange,
  onRefreshLogs,
  onLoadMoreLogs,
  hasMoreLogs,
  backups,
  loadingBackups,
  backupConfig,
  loadingBackupConfig,
  backupError,
  backupMessage,
  creatingBackup,
  restoringBackup,
  onCreateBackup,
  onDeleteBackup,
  onRestoreBackup,
  onUpdateBackupConfig,
  onPurgeExpiredBackups,
  onRefreshBackups,
  activeSection,
  onSectionChange
}: ConfigViewProps): JSX.Element {
  const [searchText, setSearchText] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeTrackActionId, setActiveTrackActionId] = useState<string | null>(null);
  const [deleteTrackCandidate, setDeleteTrackCandidate] = useState<Track | null>(null);
  const [deletingTrack, setDeletingTrack] = useState(false);
  const [editState, setEditState] = useState<EditTrackState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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
    setActionMessage(null);
    setDeletingTrack(true);

    try {
      await onDeleteTrack(track.id);
      setActionMessage(`Deleted ${getTrackDisplayTitle(track)}.`);
      setDeleteTrackCandidate(null);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Track deletion failed");
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
      album: track.tags.album ?? ""
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
    setActionMessage(null);

    try {
      await onUpdateTrackMetadata(editState.track.id, {
        title: editState.title.trim() || null,
        artist: editState.artist.trim() || null,
        album: editState.album.trim() || null
      });
      setActionMessage(`Metadata updated for ${getTrackDisplayTitle(editState.track)}.`);
      setEditState(null);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Metadata update failed");
    } finally {
      setSavingEdit(false);
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

      {actionMessage ? (
        <p className="text-sm text-flaque-steel" role="status" aria-live="polite">
          {actionMessage}
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
        <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
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
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>

        <div className="mt-4 space-y-3 lg:hidden">
          {filteredTracks.map((track) => {
            const runningAction = activeTrackActionId === track.id;
            const title = getTrackDisplayTitle(track);

            return (
              <article key={track.id} className="rounded-2xl border border-flaque-clay/60 bg-flaque-cream/45 p-3">
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
              </article>
            );
          })}

          {filteredTracks.length === 0 ? <p className="text-sm text-flaque-steel">No tracks match this search.</p> : null}
        </div>

        <div className="mt-4 hidden max-h-[48vh] overflow-auto rounded-2xl border border-flaque-clay/40 lg:block">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Artist</th>
                <th className="px-4 py-3 font-medium">Album</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Path</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTracks.map((track) => {
                const runningAction = activeTrackActionId === track.id;
                const title = getTrackDisplayTitle(track);

                return (
                  <tr key={track.id} className="border-t border-flaque-clay/40">
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
                  <td className="px-4 py-4 text-flaque-steel" colSpan={6}>
                    No tracks match this search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        </section>
      ) : null}

      {activeSection === "users" ? (
        <AdminUsersView
          currentUser={currentUser}
          users={users}
          loading={loadingUsers}
          error={usersError}
          onRefresh={onRefreshUsers}
          onCreateUser={onCreateUser}
          onPatchUser={onPatchUser}
          onDeleteUser={onDeleteUser}
          onResetPassword={onResetUserPassword}
        />
      ) : null}

      {activeSection === "server" ? (
        <AdminServerView
          versionInfo={versionInfo}
          loadingVersion={loadingVersion}
          updateStatus={updateStatus}
          onTriggerUpdate={onTriggerUpdate}
          storageUsage={storageUsage}
          loadingStorage={loadingStorage}
          logFiles={logFiles}
          loadingFiles={loadingLogFiles}
          selectedFile={selectedLogFile}
          onFileChange={onLogFileChange}
          entries={logEntries}
          loadingEntries={loadingLogEntries}
          error={logsError}
          total={logTotal}
          levelFilter={logLevelFilter}
          onLevelFilterChange={onLogLevelFilterChange}
          onRefresh={onRefreshLogs}
          onLoadMore={onLoadMoreLogs}
          hasMore={hasMoreLogs}
        />
      ) : null}

      {activeSection === "backup" ? (
        <AdminBackupView
          backups={backups}
          loadingBackups={loadingBackups}
          config={backupConfig}
          loadingConfig={loadingBackupConfig}
          error={backupError}
          message={backupMessage}
          creating={creatingBackup}
          restoring={restoringBackup}
          onCreateBackup={onCreateBackup}
          onDeleteBackup={onDeleteBackup}
          onRestoreBackup={onRestoreBackup}
          onUpdateConfig={onUpdateBackupConfig}
          onPurgeExpired={onPurgeExpiredBackups}
          onRefresh={onRefreshBackups}
        />
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
    </div>
  );
}
