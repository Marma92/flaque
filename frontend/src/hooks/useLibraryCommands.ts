import type { Dispatch, SetStateAction } from "react";

import {
  bulkDeleteTracks,
  bulkUpdateTrackMetadata,
  createPlaylist,
  deletePlaylist,
  deleteTrackFile,
  heartPlaylist,
  patchPlaylist,
  rebuildIndex,
  reEnrichTrack,
  reportPlaylistListen,
  updateTrackMetadata,
  uploadTracks,
  type UploadTrackPreview,
  type UploadTracksResult
} from "../api";
import { inspectAudioFile } from "../utils/inspectAudioFile";
import type { AppNotice } from "../components/AppStatusBanners";
import type { Playlist, PlaylistVisibility, TrackMetadataPatch } from "../types";

type UseLibraryCommandsArgs = {
  manageablePlaylists: Playlist[];
  refreshCurrentLibrary: () => Promise<void>;
  refreshAllTracks: () => Promise<void>;
  refreshRecentlyUploaded: () => void;
  refreshPaginatedLibrary: () => void;
  removeTrackFromPlayback: (trackId: string) => void;
  setLibraryError: Dispatch<SetStateAction<string | null>>;
  setAllTracksError: Dispatch<SetStateAction<string | null>>;
  setRebuilding: Dispatch<SetStateAction<boolean>>;
  setAppNotice: Dispatch<SetStateAction<AppNotice | null>>;
};

type UseLibraryCommandsResult = {
  handleUpload: (input: {
    files: File[];
    artist?: string;
    album?: string;
    year?: number;
    metadataOverrides?: Array<{
      title?: string;
      artist?: string;
      album?: string;
      year?: number;
    } | null>;
    onProgress?: (input: { loaded: number; total: number; percent: number }) => void;
  }) => Promise<UploadTracksResult>;
  handleInspectUploadFile: (file: File) => Promise<UploadTrackPreview>;
  handleRebuildIndex: () => Promise<void>;
  handleDeleteTrack: (trackId: string) => Promise<void>;
  handleUpdateTrackMetadata: (trackId: string, patch: TrackMetadataPatch) => Promise<void>;
  handleReEnrichTrack: (trackId: string) => Promise<void>;
  handleCreatePlaylist: (input: { name: string; visibility: PlaylistVisibility; description?: string }) => Promise<void>;
  handleAddTrackToPlaylist: (input: { trackId: string; playlistId: string }) => Promise<void>;
  handlePatchPlaylist: (playlistId: string, patch: { name?: string; visibility?: PlaylistVisibility; trackIds?: string[]; description?: string; collaborators?: string[] }) => Promise<Playlist>;
  handleDeletePlaylist: (playlistId: string) => Promise<void>;
  handleBulkDeleteTracks: (trackIds: string[]) => Promise<void>;
  handleBulkUpdateTrackMetadata: (trackIds: string[], patch: TrackMetadataPatch) => Promise<void>;
  handleHeartPlaylist: (playlistId: string) => Promise<{ hearted: boolean; heartCount: number }>;
  handleReportPlaylistListen: (playlistId: string) => Promise<void>;
};

/**
 * Library and playlist commands that mutate backend state.
 */
export function useLibraryCommands({
  manageablePlaylists,
  refreshCurrentLibrary,
  refreshAllTracks,
  refreshRecentlyUploaded,
  refreshPaginatedLibrary,
  removeTrackFromPlayback,
  setLibraryError,
  setAllTracksError,
  setRebuilding,
  setAppNotice
}: UseLibraryCommandsArgs): UseLibraryCommandsResult {
  async function handleUpload(input: {
    files: File[];
    artist?: string;
    album?: string;
    year?: number;
    metadataOverrides?: Array<{
      title?: string;
      artist?: string;
      album?: string;
      year?: number;
    } | null>;
    onProgress?: (input: { loaded: number; total: number; percent: number }) => void;
  }): Promise<UploadTracksResult> {
    const result = await uploadTracks(input);
    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
    refreshRecentlyUploaded();
    refreshPaginatedLibrary();

    setAppNotice({
      tone: "success",
      message: `Upload complete: ${result.uploaded}/${result.processed} file${result.processed > 1 ? "s" : ""} stored.`
    });

    return result;
  }

  async function handleInspectUploadFile(file: File): Promise<UploadTrackPreview> {
    return inspectAudioFile(file);
  }

  async function handleRebuildIndex(): Promise<void> {
    setRebuilding(true);
    setLibraryError(null);
    setAllTracksError(null);

    try {
      await rebuildIndex();
      await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
    refreshRecentlyUploaded();
    refreshPaginatedLibrary();
      setAppNotice({
        tone: "success",
        message: "Library index rebuilt successfully."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Index rebuild failed";
      setLibraryError(message);
      setAllTracksError(message);
      setAppNotice({
        tone: "error",
        message
      });
    } finally {
      setRebuilding(false);
    }
  }

  async function handleDeleteTrack(trackId: string): Promise<void> {
    await deleteTrackFile(trackId);
    removeTrackFromPlayback(trackId);

    setAppNotice({
      tone: "success",
      message: "Track deleted from the library."
    });

    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
    refreshRecentlyUploaded();
    refreshPaginatedLibrary();
  }

  async function handleUpdateTrackMetadata(trackId: string, patch: TrackMetadataPatch): Promise<void> {
    await updateTrackMetadata(trackId, patch);
    setAppNotice({
      tone: "success",
      message: "Track metadata updated."
    });
    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
    refreshRecentlyUploaded();
    refreshPaginatedLibrary();
  }

  async function handleReEnrichTrack(trackId: string): Promise<void> {
    const { result } = await reEnrichTrack(trackId);
    const filled: string[] = [];
    if (result.genres) filled.push(`genre: ${result.genres.join(", ")}`);
    if (result.year !== null) filled.push(`year: ${result.year}`);
    if (result.coverFetched) filled.push("cover art");
    if (filled.length === 0 && result.mbidRecording) filled.push("MBIDs");

    setAppNotice({
      tone: filled.length > 0 ? "success" : "info",
      message: filled.length > 0
        ? `Re-enriched: ${filled.join(", ")}.`
        : "Re-enrichment ran but no new data was found on MusicBrainz."
    });

    if (filled.length > 0) {
      await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
      refreshRecentlyUploaded();
      refreshPaginatedLibrary();
    }
  }

  async function handleCreatePlaylist(input: {
    name: string;
    visibility: PlaylistVisibility;
    description?: string;
  }): Promise<void> {
    await createPlaylist(input);
    setAppNotice({
      tone: "success",
      message: "Playlist created."
    });
    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
    refreshRecentlyUploaded();
    refreshPaginatedLibrary();
  }

  async function handleAddTrackToPlaylist(input: { trackId: string; playlistId: string }): Promise<void> {
    const targetPlaylist = manageablePlaylists.find((playlist) => playlist.id === input.playlistId);
    if (!targetPlaylist) {
      throw new Error("Playlist not found or not writable");
    }

    const nextTrackIds = targetPlaylist.trackIds.includes(input.trackId)
      ? targetPlaylist.trackIds
      : [...targetPlaylist.trackIds, input.trackId];

    if (nextTrackIds === targetPlaylist.trackIds) {
      return;
    }

    await patchPlaylist(targetPlaylist.id, {
      trackIds: nextTrackIds
    });

    setAppNotice({
      tone: "success",
      message: `Track added to playlist ${targetPlaylist.name}.`
    });

    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
    refreshRecentlyUploaded();
    refreshPaginatedLibrary();
  }

  async function handlePatchPlaylist(
    playlistId: string,
    patch: { name?: string; visibility?: PlaylistVisibility; trackIds?: string[]; description?: string; collaborators?: string[] }
  ): Promise<Playlist> {
    const updated = await patchPlaylist(playlistId, patch);
    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
    refreshRecentlyUploaded();
    refreshPaginatedLibrary();
    return updated;
  }

  async function handleDeletePlaylist(playlistId: string): Promise<void> {
    await deletePlaylist(playlistId);
    setAppNotice({ tone: "success", message: "Playlist deleted." });
    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
    refreshRecentlyUploaded();
    refreshPaginatedLibrary();
  }

  async function handleBulkDeleteTracks(trackIds: string[]): Promise<void> {
    const result = await bulkDeleteTracks(trackIds);
    for (const id of result.deleted) {
      removeTrackFromPlayback(id);
    }

    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
    refreshRecentlyUploaded();
    refreshPaginatedLibrary();
  }

  async function handleBulkUpdateTrackMetadata(trackIds: string[], patch: TrackMetadataPatch): Promise<void> {
    await bulkUpdateTrackMetadata(trackIds, patch);

    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
    refreshRecentlyUploaded();
    refreshPaginatedLibrary();
  }

  async function handleHeartPlaylist(playlistId: string): Promise<{ hearted: boolean; heartCount: number }> {
    const result = await heartPlaylist(playlistId);
    await refreshCurrentLibrary();
    return result;
  }

  async function handleReportPlaylistListen(playlistId: string): Promise<void> {
    await reportPlaylistListen(playlistId);
  }

  return {
    handleUpload,
    handleInspectUploadFile,
    handleRebuildIndex,
    handleDeleteTrack,
    handleUpdateTrackMetadata,
    handleReEnrichTrack,
    handleBulkDeleteTracks,
    handleBulkUpdateTrackMetadata,
    handleCreatePlaylist,
    handleAddTrackToPlaylist,
    handlePatchPlaylist,
    handleDeletePlaylist,
    handleHeartPlaylist,
    handleReportPlaylistListen
  };
}
