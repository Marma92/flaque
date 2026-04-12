import type { Dispatch, SetStateAction } from "react";

import {
  createPlaylist,
  deletePlaylist,
  deleteTrackFile,
  patchPlaylist,
  rebuildIndex,
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
    metadataOverrides?: Array<{
      title?: string;
      artist?: string;
      album?: string;
    } | null>;
    onProgress?: (input: { loaded: number; total: number; percent: number }) => void;
  }) => Promise<UploadTracksResult>;
  handleInspectUploadFile: (file: File) => Promise<UploadTrackPreview>;
  handleRebuildIndex: () => Promise<void>;
  handleDeleteTrack: (trackId: string) => Promise<void>;
  handleUpdateTrackMetadata: (trackId: string, patch: TrackMetadataPatch) => Promise<void>;
  handleCreatePlaylist: (input: { name: string; visibility: PlaylistVisibility }) => Promise<void>;
  handleAddTrackToPlaylist: (input: { trackId: string; playlistId: string }) => Promise<void>;
  handlePatchPlaylist: (playlistId: string, patch: { name?: string; visibility?: PlaylistVisibility; trackIds?: string[] }) => Promise<void>;
  handleDeletePlaylist: (playlistId: string) => Promise<void>;
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
    metadataOverrides?: Array<{
      title?: string;
      artist?: string;
      album?: string;
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

  async function handleCreatePlaylist(input: {
    name: string;
    visibility: PlaylistVisibility;
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
    patch: { name?: string; visibility?: PlaylistVisibility; trackIds?: string[] }
  ): Promise<void> {
    await patchPlaylist(playlistId, patch);
    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
    refreshRecentlyUploaded();
    refreshPaginatedLibrary();
  }

  async function handleDeletePlaylist(playlistId: string): Promise<void> {
    await deletePlaylist(playlistId);
    setAppNotice({ tone: "success", message: "Playlist deleted." });
    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
    refreshRecentlyUploaded();
    refreshPaginatedLibrary();
  }

  return {
    handleUpload,
    handleInspectUploadFile,
    handleRebuildIndex,
    handleDeleteTrack,
    handleUpdateTrackMetadata,
    handleCreatePlaylist,
    handleAddTrackToPlaylist,
    handlePatchPlaylist,
    handleDeletePlaylist
  };
}
