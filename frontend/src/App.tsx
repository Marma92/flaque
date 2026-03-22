import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getMySessions,
  logout,
  logoutOtherSessions,
  myProfilePhotoUrl,
  requestPasswordReset,
  resetPasswordWithToken,
  revokeMySession,
  updateMyPassword,
  uploadMyProfilePhoto
} from "./api";
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
import type { ViewName } from "./utils/appUtils";
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
    handleLogin,
    notifyAuthStateChanged
  } = useSessionRoutingState();

  const [rebuilding, setRebuilding] = useState(false);
  const [playerStatusMessage, setPlayerStatusMessage] = useState<string | null>(null);
  const [appNotice, setAppNotice] = useState<AppNotice | null>(null);
  const [playerReturnView, setPlayerReturnView] = useState<ViewName>("library");
  const [avatarVersion, setAvatarVersion] = useState(0);

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

  const avatarUrl = useMemo(() => {
    return myProfilePhotoUrl({
      version: avatarVersion,
      userId: user?.id
    });
  }, [avatarVersion, user?.id]);

  useEffect(() => {
    setAvatarVersion(0);
  }, [user?.id]);

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

  useEffect(() => {
    if (activeView !== "player") {
      setPlayerReturnView(activeView);
    }
  }, [activeView]);

  function handleViewChange(nextView: ViewName): void {
    if (nextView === "player") {
      if (activeView !== "player") {
        setPlayerReturnView(activeView);
      }
      setActiveView("player");
      return;
    }

    setActiveView(nextView);
  }

  function handleCollapsePlayer(): void {
    const nextView = playerReturnView === "player" ? "library" : playerReturnView;
    setActiveView(nextView);
  }

  async function handleLogout(): Promise<void> {
    await logout();
    setUser(null);
    notifyAuthStateChanged("logout");
    resetAfterLogout();
    setActiveLibrarySection("music");
    setPlayerReturnView("library");
    setAvatarVersion(0);
    setFilters({});
    clearAdminState();
    setLibraryError(null);
    setAllTracksError(null);
  }

  async function handleUpdateProfilePhoto(file: File): Promise<void> {
    await uploadMyProfilePhoto(file);
    setAvatarVersion((current) => current + 1);
    setAppNotice({
      tone: "success",
      message: "Profile photo updated"
    });
  }

  async function handleUpdateOwnPassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
    await updateMyPassword(input);
    notifyAuthStateChanged("session-change");
    setAppNotice({
      tone: "success",
      message: "Password updated"
    });
  }

  async function handleRequestPasswordReset(loginValue: string): Promise<void> {
    await requestPasswordReset(loginValue);
  }

  async function handleResetPasswordWithToken(token: string, newPassword: string): Promise<void> {
    await resetPasswordWithToken(token, newPassword);
  }

  const handleListMySessions = useCallback(async () => {
    return getMySessions();
  }, []);

  const handleRevokeMySession = useCallback(
    async (sessionId: string): Promise<void> => {
      await revokeMySession(sessionId);
      notifyAuthStateChanged("session-change");
      setAppNotice({
        tone: "success",
        message: "Session revoked"
      });
    },
    [notifyAuthStateChanged]
  );

  const handleLogoutOtherSessions = useCallback(async (): Promise<number> => {
    const result = await logoutOtherSessions();
    notifyAuthStateChanged("session-change");
    setAppNotice({
      tone: "success",
      message: `${result.revoked} session${result.revoked === 1 ? "" : "s"} logged out`
    });
    return result.revoked;
  }, [notifyAuthStateChanged]);

  if (!sessionChecked) {
    return <main className="p-8 text-flaque-ink">Loading session...</main>;
  }

  if (!user) {
    return (
      <LoginPage
        onLogin={handleLogin}
        onRequestPasswordReset={handleRequestPasswordReset}
        onResetPassword={handleResetPasswordWithToken}
      />
    );
  }

  return (
    <AppShell
      activeView={activeView}
      user={user}
      onViewChange={handleViewChange}
      onPlayerCollapse={handleCollapsePlayer}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
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
      accountViewProps={{
        user,
        avatarUrl,
        onUpdatePhoto: handleUpdateProfilePhoto,
        onChangePassword: handleUpdateOwnPassword,
        onListSessions: handleListMySessions,
        onRevokeSession: handleRevokeMySession,
        onLogoutOtherSessions: handleLogoutOtherSessions
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
