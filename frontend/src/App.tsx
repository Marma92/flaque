import { useEffect, useMemo, useState } from "react";

import { logout } from "./api";
import type { AppNotice } from "./components/AppStatusBanners";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./components/LoginPage";
import { useAdminCommands } from "./hooks/useAdminCommands";
import { useAdminUsers } from "./hooks/useAdminUsers";
import { useLibraryCommands } from "./hooks/useLibraryCommands";
import { useLibraryData } from "./hooks/useLibraryData";
import { usePlaybackCommands } from "./hooks/usePlaybackCommands";
import { usePlaybackState } from "./hooks/usePlaybackState";
import { useSessionRoutingState } from "./hooks/useSessionRoutingState";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "./utils/tracks";

const DEFAULT_DOCUMENT_TITLE = "Flaque Hifi Player";

export default function App(): JSX.Element {
  const {
    user,
    setUser,
    sessionChecked,
    activeView,
    setActiveView,
    activeLibrarySection,
    setActiveLibrarySection,
    handleLogin
  } = useSessionRoutingState();

  const [rebuilding, setRebuilding] = useState(false);
  const [playerStatusMessage, setPlayerStatusMessage] = useState<string | null>(null);
  const [appNotice, setAppNotice] = useState<AppNotice | null>(null);

  const {
    filters,
    setFilters,
    library,
    allTracksLibrary,
    availablePlaylists,
    libraryArtists,
    libraryAlbums,
    selectedAlbum,
    selectedAlbumTracks,
    selectedAlbumTracksError,
    loadingLibrary,
    loadingAllTracks,
    loadingLibraryArtists,
    loadingLibraryAlbums,
    loadingSelectedAlbumTracks,
    libraryError,
    setLibraryError,
    allTracksError,
    setAllTracksError,
    libraryMetadataError,
    refreshCurrentLibrary,
    refreshAllTracks,
    selectAlbum
  } = useLibraryData({
    user,
    activeView,
    activeLibrarySection
  });

  const allTracksById = useMemo(() => {
    return new Map(allTracksLibrary.tracks.map((track) => [track.id, track]));
  }, [allTracksLibrary.tracks]);

  const {
    selectedTrackRefreshed,
    refreshedQueue,
    playRequestNonce,
    transcodeMode,
    setTranscodeMode,
    repeatMode,
    setRepeatMode,
    shuffleEnabled,
    setShuffleEnabled,
    recentTracks,
    requestTrackPlayback,
    replayRecentTrack,
    recordTrackPlayed,
    removeTrackFromPlayback,
    setSelectedTrack,
    resetAfterLogout
  } = usePlaybackState({
    user,
    allTracksById,
    allTracks: allTracksLibrary.tracks,
    loadingAllTracks
  });

  const {
    adminUsers,
    loadingAdminUsers,
    adminError,
    refreshAdminUsers,
    clearAdminState
  } = useAdminUsers({ user });

  const {
    handleCreateUser,
    handleDeleteUser,
    handleResetUserPassword,
    handlePatchUser
  } = useAdminCommands({
    user,
    setUser,
    setActiveView,
    clearAdminState,
    refreshAdminUsers
  });

  const manageablePlaylists = useMemo(() => {
    if (!user) {
      return [];
    }

    return availablePlaylists.filter((playlist) => playlist.authorId === user.id || user.role === "admin");
  }, [availablePlaylists, user]);

  const ownerNameById = useMemo<Record<string, string>>(() => {
    const entries: Array<[string, string]> = [];

    if (user) {
      entries.push([user.id, user.username]);
    }

    for (const adminUser of adminUsers) {
      entries.push([adminUser.id, adminUser.username]);
    }

    return Object.fromEntries(entries);
  }, [user, adminUsers]);

  const {
    handleUpload,
    handleInspectUploadFile,
    handleRebuildIndex,
    handleDeleteTrack,
    handleUpdateTrackMetadata,
    handleCreatePlaylist,
    handleAddTrackToPlaylist
  } = useLibraryCommands({
    manageablePlaylists,
    refreshCurrentLibrary,
    refreshAllTracks,
    removeTrackFromPlayback,
    setLibraryError,
    setAllTracksError,
    setRebuilding,
    setAppNotice
  });

  const {
    requestTrackPlaybackWithStatus,
    handleReplayRecentTrack,
    handlePlayPlaylist,
    handleNavigateTrack
  } = usePlaybackCommands({
    selectedTrackRefreshed,
    refreshedQueue,
    shuffleEnabled,
    allTracks: allTracksLibrary.tracks,
    filters,
    allTracksById,
    requestTrackPlayback,
    replayRecentTrack,
    setSelectedTrack,
    setPlayerStatusMessage,
    setLibraryError,
    setAppNotice
  });

  useEffect(() => {
    if (!appNotice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setAppNotice(null);
    }, 4800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [appNotice]);

  useEffect(() => {
    if (!selectedTrackRefreshed) {
      document.title = DEFAULT_DOCUMENT_TITLE;
      return;
    }

    const title = getTrackDisplayTitle(selectedTrackRefreshed);
    const artist = getTrackDisplayArtist(selectedTrackRefreshed) ?? "Unknown artist";
    document.title = `${title} - ${artist} | Flaque`;
  }, [selectedTrackRefreshed]);

  async function handleLogout(): Promise<void> {
    await logout();
    setUser(null);
    resetAfterLogout();
    setActiveLibrarySection("music");
    setFilters({});
    clearAdminState();
    setLibraryError(null);
    setAllTracksError(null);
  }

  if (!sessionChecked) {
    return <main className="p-8 text-flaque-ink">Loading session...</main>;
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <AppShell
      activeView={activeView}
      user={user}
      onViewChange={setActiveView}
      onLogout={handleLogout}
      appNotice={appNotice}
      libraryError={libraryError}
      loadingLibrary={loadingLibrary}
      libraryWorkspaceProps={{
        activeLibrarySection,
        onSectionChange: setActiveLibrarySection,
        availablePlaylists,
        ownerNameById,
        onCreatePlaylist: handleCreatePlaylist,
        onPlayPlaylist: handlePlayPlaylist,
        libraryMetadataError,
        loadingLibraryArtists,
        libraryArtists,
        loadingLibraryAlbums,
        libraryAlbums,
        selectedAlbum,
        selectedAlbumTracks,
        loadingSelectedAlbumTracks,
        selectedAlbumTracksError,
        currentTrackId: selectedTrackRefreshed?.id,
        onAlbumSelect: selectAlbum,
        onAlbumTrackSelect: (track) => requestTrackPlaybackWithStatus(track, selectedAlbumTracks),
        recentTracks,
        onRecentTrackReplay: handleReplayRecentTrack,
        library,
        filters,
        onFilterChange: (next) => setFilters(next),
        onLibraryTrackSelect: (track) => requestTrackPlaybackWithStatus(track, library.tracks)
      }}
      uploadViewProps={{
        onUpload: handleUpload,
        onInspectFile: handleInspectUploadFile
      }}
      configViewProps={{
        currentUser: user,
        tracks: allTracksLibrary.tracks,
        ownerNameById,
        loadingTracks: loadingAllTracks,
        trackError: allTracksError,
        rebuilding,
        onRebuildIndex: handleRebuildIndex,
        onRefreshTracks: refreshAllTracks,
        onDeleteTrack: handleDeleteTrack,
        onUpdateTrackMetadata: handleUpdateTrackMetadata,
        users: adminUsers,
        loadingUsers: loadingAdminUsers,
        usersError: adminError,
        onRefreshUsers: refreshAdminUsers,
        onCreateUser: handleCreateUser,
        onPatchUser: handlePatchUser,
        onDeleteUser: handleDeleteUser,
        onResetUserPassword: handleResetUserPassword
      }}
      playerStatusMessage={playerStatusMessage}
      audioPlayerProps={{
        track: selectedTrackRefreshed,
        onNext: (options) => handleNavigateTrack("next", options?.wrap ?? true),
        onPrevious: (options) => handleNavigateTrack("previous", options?.wrap ?? true),
        onTrackPlayed: recordTrackPlayed,
        transcodeMode,
        onTranscodeModeChange: setTranscodeMode,
        repeatMode,
        onRepeatModeChange: setRepeatMode,
        shuffleEnabled,
        onShuffleEnabledChange: setShuffleEnabled,
        playRequestNonce,
        playlists: manageablePlaylists,
        onAddTrackToPlaylist: handleAddTrackToPlaylist,
        queueTracks: refreshedQueue,
        currentQueueTrackId: selectedTrackRefreshed?.id ?? null,
        onQueueTrackSelect: (queueTrack) => {
          requestTrackPlaybackWithStatus(queueTrack, refreshedQueue.length > 0 ? refreshedQueue : undefined);
        }
      }}
    />
  );
}
