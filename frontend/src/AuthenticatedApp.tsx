import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { logout, myProfilePhotoUrl } from "./api";
import { AppShell } from "./components/AppShell";
import type { ConfigSection } from "./components/ConfigView";
import type { User } from "./types";
import type { LibrarySection } from "./types/library";
import type { ViewName } from "./utils/appUtils";
import { useAccountActions } from "./hooks/useAccountActions";
import { useAdminCommands } from "./hooks/useAdminCommands";
import { useAdminServer } from "./hooks/useAdminServer";
import { useAdminUsers } from "./hooks/useAdminUsers";
import { useAppNotice } from "./hooks/useAppNotice";
import { useDocumentTitle } from "./hooks/useDocumentTitle";
import { useInfiniteLibrary } from "./hooks/useInfiniteLibrary";
import { useLibraryCommands } from "./hooks/useLibraryCommands";
import { useLibraryData } from "./hooks/useLibraryData";
import { usePlaybackCommands } from "./hooks/usePlaybackCommands";
import { usePlaybackState } from "./hooks/usePlaybackState";
import { useRecentlyUploaded } from "./hooks/useRecentlyUploaded";

type AuthenticatedAppProps = {
  user: User;
  setUser: Dispatch<SetStateAction<User | null>>;
  activeView: ViewName;
  setActiveView: Dispatch<SetStateAction<ViewName>>;
  activeLibrarySection: LibrarySection;
  setActiveLibrarySection: Dispatch<SetStateAction<LibrarySection>>;
  notifyAuthStateChanged: (kind: "login" | "logout" | "session-change") => void;
};

export function AuthenticatedApp({
  user,
  setUser,
  activeView,
  setActiveView,
  activeLibrarySection,
  setActiveLibrarySection,
  notifyAuthStateChanged
}: AuthenticatedAppProps): JSX.Element {
  // ── UI state ──────────────────────────────────────────────────────────
  const [rebuilding, setRebuilding] = useState(false);
  const [activeConfigSection, setActiveConfigSection] = useState<ConfigSection>("index");
  const [playerStatusMessage, setPlayerStatusMessage] = useState<string | null>(null);
  const { appNotice, setAppNotice } = useAppNotice();
  const [playerReturnView, setPlayerReturnView] = useState<ViewName>("library");
  const [avatarVersion, setAvatarVersion] = useState(0);

  // ── Library data ──────────────────────────────────────────────────────
  const {
    filters, setFilters,
    library, allTracksLibrary, availablePlaylists,
    libraryArtists, selectedArtist, artistAlbums, selectedArtistAlbum, libraryAlbums,
    selectedArtistAlbumTracks, selectedArtistAlbumTracksError,
    selectedAlbum, selectedAlbumTracks, selectedAlbumTracksError,
    loadingLibrary, loadingAllTracks,
    loadingLibraryArtists, loadingArtistAlbums, loadingSelectedArtistAlbumTracks, loadingLibraryAlbums, loadingSelectedAlbumTracks,
    libraryError, setLibraryError,
    allTracksError, setAllTracksError,
    libraryMetadataError,
    refreshCurrentLibrary, refreshAllTracks,
    selectArtist, clearSelectedArtist, selectArtistAlbum, clearSelectedArtistAlbum,
    selectAlbum, clearSelectedAlbum
  } = useLibraryData({ user, activeView, activeLibrarySection });

  // ── Recently uploaded ────────────────────────────────────────────────
  const {
    tracks: recentlyUploadedTracks,
    loading: recentlyUploadedLoading,
    period: recentlyUploadedPeriod,
    setPeriod: setRecentlyUploadedPeriod,
    refresh: refreshRecentlyUploaded
  } = useRecentlyUploaded({ user, ownerFilter: filters.owner });

  // ── Paginated library ──────────────────────────────────────────────
  const {
    tracks: paginatedTracks,
    loading: paginatedLoading,
    loadingMore: paginatedLoadingMore,
    hasMore: paginatedHasMore,
    total: paginatedTotal,
    sentinelRef: paginatedSentinelRef,
    refresh: refreshPaginatedLibrary
  } = useInfiniteLibrary({ user, filters, pageSize: 30 });

  const allTracksById = useMemo(
    () => new Map(allTracksLibrary.tracks.map((track) => [track.id, track])),
    [allTracksLibrary.tracks]
  );

  // ── Playback ──────────────────────────────────────────────────────────
  const {
    selectedTrackRefreshed, refreshedQueue, playRequestNonce,
    transcodeMode, setTranscodeMode,
    repeatMode, setRepeatMode,
    shuffleEnabled, setShuffleEnabled,
    recentTracks, requestTrackPlayback, replayRecentTrack,
    recordTrackPlayed, removeTrackFromPlayback,
    setSelectedTrack, resetAfterLogout
  } = usePlaybackState({ user, allTracksById, allTracks: allTracksLibrary.tracks, loadingAllTracks });

  // ── Admin ─────────────────────────────────────────────────────────────
  const { adminUsers, loadingAdminUsers, adminError, refreshAdminUsers, clearAdminState } = useAdminUsers({ user });

  const {
    versionInfo, loadingVersion,
    updateStatus, onTriggerUpdate,
    storageUsage, loadingStorage,
    logFiles, loadingFiles: loadingLogFiles,
    selectedFile: selectedLogFile, setSelectedFile: setSelectedLogFile,
    entries: logEntries, loadingEntries: loadingLogEntries,
    serverError: logsError, total: logTotal,
    levelFilter: logLevelFilter, setLevelFilter: setLogLevelFilter,
    refreshServer: refreshLogs, loadMore: loadMoreLogs, hasMore: hasMoreLogs
  } = useAdminServer({ user });

  const { handleCreateUser, handleDeleteUser, handleResetUserPassword, handlePatchUser } = useAdminCommands({
    user, setUser, setActiveView, clearAdminState, refreshAdminUsers
  });

  // ── Derived data ──────────────────────────────────────────────────────
  const manageablePlaylists = useMemo(() => {
    if (!user) {
      return [];
    }
    return availablePlaylists.filter((pl) => pl.authorId === user.id || user.role === "admin");
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

  const avatarUrl = useMemo(
    () => myProfilePhotoUrl({ version: avatarVersion, userId: user?.id }),
    [avatarVersion, user?.id]
  );

  // ── Commands ──────────────────────────────────────────────────────────
  const {
    handleUpload, handleInspectUploadFile, handleRebuildIndex,
    handleDeleteTrack, handleUpdateTrackMetadata,
    handleCreatePlaylist, handleAddTrackToPlaylist
  } = useLibraryCommands({
    manageablePlaylists, refreshCurrentLibrary, refreshAllTracks,
    refreshRecentlyUploaded, refreshPaginatedLibrary,
    removeTrackFromPlayback, setLibraryError, setAllTracksError,
    setRebuilding, setAppNotice
  });

  const {
    requestTrackPlaybackWithStatus, handleReplayRecentTrack,
    handlePlayPlaylist, handleNavigateTrack
  } = usePlaybackCommands({
    selectedTrackRefreshed, refreshedQueue, shuffleEnabled,
    allTracks: allTracksLibrary.tracks, filters, allTracksById,
    requestTrackPlayback, replayRecentTrack, setSelectedTrack,
    setPlayerStatusMessage, setLibraryError, setAppNotice
  });

  const {
    handleUpdateProfilePhoto, handleUpdateEmail, handleUpdateOwnPassword,
    handleListMySessions, handleRevokeMySession, handleLogoutOtherSessions
  } = useAccountActions({ notifyAuthStateChanged, setAppNotice, setAvatarVersion, setUser });

  // ── Side effects ──────────────────────────────────────────────────────

  useEffect(() => {
    setAvatarVersion(0);
  }, [user?.id]);

  useDocumentTitle(selectedTrackRefreshed);

  useEffect(() => {
    if (activeView !== "player") {
      setPlayerReturnView(activeView);
    }
  }, [activeView]);

  // ── View navigation ───────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────

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
        selectedArtist,
        artistAlbums,
        selectedArtistAlbum,
        selectedArtistAlbumTracks,
        loadingSelectedArtistAlbumTracks,
        selectedArtistAlbumTracksError,
        loadingArtistAlbums,
        onArtistSelect: selectArtist,
        onArtistBack: clearSelectedArtist,
        onArtistAlbumSelect: selectArtistAlbum,
        onArtistAlbumBack: clearSelectedArtistAlbum,
        onArtistAlbumTrackSelect: (track) => requestTrackPlaybackWithStatus(track, selectedArtistAlbumTracks),
        loadingLibraryAlbums,
        libraryAlbums,
        selectedAlbum,
        selectedAlbumTracks,
        loadingSelectedAlbumTracks,
        selectedAlbumTracksError,
        currentTrackId: selectedTrackRefreshed?.id,
        onAlbumSelect: selectAlbum,
        onAlbumBack: clearSelectedAlbum,
        onAlbumTrackSelect: (track) => requestTrackPlaybackWithStatus(track, selectedAlbumTracks),
        recentTracks,
        onRecentTrackReplay: handleReplayRecentTrack,
        library,
        filters,
        onFilterChange: (next) => setFilters(next),
        onLibraryTrackSelect: (track) => requestTrackPlaybackWithStatus(track, paginatedTracks),
        manageablePlaylists,
        onAddTrackToPlaylist: handleAddTrackToPlaylist,
        recentlyUploadedTracks,
        recentlyUploadedLoading,
        recentlyUploadedPeriod,
        onRecentlyUploadedPeriodChange: setRecentlyUploadedPeriod,
        paginatedTracks,
        paginatedTotal,
        paginatedLoading,
        paginatedLoadingMore,
        paginatedHasMore,
        paginatedSentinelRef
      }}
      uploadViewProps={{
        onUpload: handleUpload,
        onInspectFile: handleInspectUploadFile
      }}
      configViewProps={{
        activeSection: activeConfigSection,
        onSectionChange: setActiveConfigSection,
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
        onResetUserPassword: handleResetUserPassword,
        versionInfo,
        loadingVersion,
        updateStatus,
        onTriggerUpdate,
        storageUsage,
        loadingStorage,
        logFiles,
        loadingLogFiles,
        selectedLogFile,
        onLogFileChange: setSelectedLogFile,
        logEntries,
        loadingLogEntries,
        logsError,
        logTotal,
        logLevelFilter,
        onLogLevelFilterChange: setLogLevelFilter,
        onRefreshLogs: refreshLogs,
        onLoadMoreLogs: loadMoreLogs,
        hasMoreLogs
      }}
      accountViewProps={{
        user,
        avatarUrl,
        onUpdatePhoto: handleUpdateProfilePhoto,
        onUpdateEmail: handleUpdateEmail,
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
