import { useEffect, useMemo, useState } from "react";

import { logout } from "./api";
import { AudioPlayer } from "./components/AudioPlayer";
import { AppHeader } from "./components/AppHeader";
import { AppStatusBanners, type AppNotice } from "./components/AppStatusBanners";
import { ConfigView } from "./components/ConfigView";
import { LibraryWorkspace } from "./components/LibraryWorkspace";
import { LoginPage } from "./components/LoginPage";
import { PlayerShell } from "./components/PlayerShell";
import { UploadView } from "./components/UploadView";
import { useAdminCommands } from "./hooks/useAdminCommands";
import { useAdminUsers } from "./hooks/useAdminUsers";
import { useLibraryCommands } from "./hooks/useLibraryCommands";
import { useLibraryData } from "./hooks/useLibraryData";
import { usePlaybackCommands } from "./hooks/usePlaybackCommands";
import { usePlaybackState } from "./hooks/usePlaybackState";
import { useSessionRoutingState } from "./hooks/useSessionRoutingState";

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

  const hasStickyPlayer = Boolean(selectedTrackRefreshed) && activeView !== "player";
  const shouldRenderPlayer = Boolean(selectedTrackRefreshed) || activeView === "player";

  if (!sessionChecked) {
    return <main className="p-8 text-flaque-ink">Loading session...</main>;
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <main
      className={`mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-4 pt-6 md:px-6 ${
        hasStickyPlayer
          ? "pb-[calc(18rem+env(safe-area-inset-bottom))]"
          : activeView === "player"
            ? "pb-0"
            : "pb-[calc(2.5rem+env(safe-area-inset-bottom))]"
      }`}
    >
      <AppHeader activeView={activeView} user={user} onViewChange={setActiveView} onLogout={handleLogout} />

      <AppStatusBanners
        appNotice={appNotice}
        libraryError={libraryError}
        showLibraryRefreshing={activeView === "library" && loadingLibrary}
      />

      {activeView === "library" ? (
        <LibraryWorkspace
          activeLibrarySection={activeLibrarySection}
          onSectionChange={setActiveLibrarySection}
          availablePlaylists={availablePlaylists}
          ownerNameById={ownerNameById}
          onCreatePlaylist={handleCreatePlaylist}
          onPlayPlaylist={handlePlayPlaylist}
          libraryMetadataError={libraryMetadataError}
          loadingLibraryArtists={loadingLibraryArtists}
          libraryArtists={libraryArtists}
          loadingLibraryAlbums={loadingLibraryAlbums}
          libraryAlbums={libraryAlbums}
          selectedAlbum={selectedAlbum}
          selectedAlbumTracks={selectedAlbumTracks}
          loadingSelectedAlbumTracks={loadingSelectedAlbumTracks}
          selectedAlbumTracksError={selectedAlbumTracksError}
          currentTrackId={selectedTrackRefreshed?.id}
          onAlbumSelect={selectAlbum}
          onAlbumTrackSelect={(track) => requestTrackPlaybackWithStatus(track, selectedAlbumTracks)}
          recentTracks={recentTracks}
          onRecentTrackReplay={handleReplayRecentTrack}
          library={library}
          filters={filters}
          onFilterChange={(next) => setFilters(next)}
          onLibraryTrackSelect={(track) => requestTrackPlaybackWithStatus(track, library.tracks)}
        />
      ) : null}

      {activeView === "upload" ? (
        <UploadView onUpload={handleUpload} onInspectFile={handleInspectUploadFile} />
      ) : null}

      {activeView === "config" && user.role === "admin" ? (
        <ConfigView
          currentUser={user}
          tracks={allTracksLibrary.tracks}
          ownerNameById={ownerNameById}
          loadingTracks={loadingAllTracks}
          trackError={allTracksError}
          rebuilding={rebuilding}
          onRebuildIndex={handleRebuildIndex}
          onRefreshTracks={refreshAllTracks}
          onDeleteTrack={handleDeleteTrack}
          onUpdateTrackMetadata={handleUpdateTrackMetadata}
          users={adminUsers}
          loadingUsers={loadingAdminUsers}
          usersError={adminError}
          onRefreshUsers={refreshAdminUsers}
          onCreateUser={handleCreateUser}
          onPatchUser={handlePatchUser}
          onDeleteUser={handleDeleteUser}
          onResetUserPassword={handleResetUserPassword}
        />
      ) : null}

      {shouldRenderPlayer ? (
        <PlayerShell activeView={activeView} playerStatusMessage={playerStatusMessage}>
          <AudioPlayer
            track={selectedTrackRefreshed}
            expanded={activeView === "player"}
            onNext={(options) => handleNavigateTrack("next", options?.wrap ?? true)}
            onPrevious={(options) => handleNavigateTrack("previous", options?.wrap ?? true)}
            onTrackPlayed={recordTrackPlayed}
            transcodeMode={transcodeMode}
            onTranscodeModeChange={setTranscodeMode}
            repeatMode={repeatMode}
            onRepeatModeChange={setRepeatMode}
            shuffleEnabled={shuffleEnabled}
            onShuffleEnabledChange={setShuffleEnabled}
            playRequestNonce={playRequestNonce}
            playlists={manageablePlaylists}
            onAddTrackToPlaylist={handleAddTrackToPlaylist}
            queueTracks={refreshedQueue}
            currentQueueTrackId={selectedTrackRefreshed?.id ?? null}
            onQueueTrackSelect={(queueTrack) => {
              requestTrackPlaybackWithStatus(queueTrack, refreshedQueue.length > 0 ? refreshedQueue : undefined);
            }}
            onArtworkClick={activeView === "player" ? undefined : () => setActiveView("player")}
          />
        </PlayerShell>
      ) : null}
    </main>
  );
}
