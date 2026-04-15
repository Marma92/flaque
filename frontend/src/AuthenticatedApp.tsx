import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { logout, myProfilePhotoUrl } from "./api";
import { AppShell } from "./components/AppShell";
import type { ConfigSection } from "./components/ConfigView";
import type { Track, User } from "./types";
import type { LibrarySection } from "./types/library";
import { navigateTo, type ViewName } from "./utils/appUtils";
import { useAccountActions } from "./hooks/useAccountActions";
import { useAdminBackup } from "./hooks/useAdminBackup";
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
import { useAutoPlaylists } from "./hooks/useAutoPlaylists";
import { useForYouPlaylists } from "./hooks/useForYouPlaylists";
import { useRadioStation } from "./hooks/useRadioStation";

type AuthenticatedAppProps = {
  user: User;
  setUser: Dispatch<SetStateAction<User | null>>;
  activeView: ViewName;
  setActiveView: Dispatch<SetStateAction<ViewName>>;
  activeLibrarySection: LibrarySection;
  setActiveLibrarySection: Dispatch<SetStateAction<LibrarySection>>;
  activeConfigSection: ConfigSection;
  setActiveConfigSection: Dispatch<SetStateAction<ConfigSection>>;
  playlistDetailId: string | null;
  setPlaylistDetailId: Dispatch<SetStateAction<string | null>>;
  notifyAuthStateChanged: (kind: "login" | "logout" | "session-change") => void;
};

export function AuthenticatedApp({
  user,
  setUser,
  activeView,
  setActiveView,
  activeLibrarySection,
  setActiveLibrarySection,
  activeConfigSection,
  setActiveConfigSection,
  playlistDetailId,
  setPlaylistDetailId,
  notifyAuthStateChanged
}: AuthenticatedAppProps): JSX.Element {
  // ── UI state ──────────────────────────────────────────────────────────
  const [rebuilding, setRebuilding] = useState(false);
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

  const { autoPlaylists, loading: loadingAutoPlaylists, refresh: refreshAutoPlaylists } = useAutoPlaylists();
  const { forYouPlaylists, loading: loadingForYouPlaylists, dismiss: dismissForYouPlaylist } = useForYouPlaylists();

  const allTracksById = useMemo(
    () => new Map(allTracksLibrary.tracks.map((track) => [track.id, track])),
    [allTracksLibrary.tracks]
  );

  // ── Playback ──────────────────────────────────────────────────────────
  const {
    selectedTrackRefreshed, refreshedQueue, playRequestNonce,
    playRequestOffsetSec,
    transcodeMode, setTranscodeMode,
    repeatMode, setRepeatMode,
    shuffleEnabled, setShuffleEnabled,
    recentTracks, requestTrackPlayback, replayRecentTrack,
    recordTrackPlayed, removeTrackFromPlayback,
    setSelectedTrack, resetAfterLogout
  } = usePlaybackState({ user, allTracksById, allTracks: allTracksLibrary.tracks, loadingAllTracks });

  const handlePlayRadioTrack = useCallback((track: Track, startOffsetSec: number): void => {
    requestTrackPlayback(track, [track], { startOffsetSec });
  }, [requestTrackPlayback]);

  const {
    loading: loadingRadio,
    stationId: radioStationId,
    currentTrack: radioCurrentTrack,
    nextTrack: radioNextTrack,
    isRadioPlaybackActive,
    startRadioPlayback,
    stopRadioPlayback
  } = useRadioStation({
    userId: user?.id,
    onPlayRadioTrack: handlePlayRadioTrack
  });

  useEffect(() => {
    if (!isRadioPlaybackActive) {
      return;
    }

    if (!selectedTrackRefreshed || selectedTrackRefreshed.owner === "radio") {
      return;
    }

    stopRadioPlayback();
  }, [isRadioPlaybackActive, selectedTrackRefreshed, stopRadioPlayback]);

  const isRadioPlaybackLocked = isRadioPlaybackActive && selectedTrackRefreshed?.owner === "radio";
  const isRadioStopped = !isRadioPlaybackActive && selectedTrackRefreshed?.owner === "radio";

  // ── Admin ─────────────────────────────────────────────────────────────
  const { adminUsers, loadingAdminUsers, adminError, refreshAdminUsers, clearAdminState } = useAdminUsers({ user });

  const {
    versionInfo, loadingVersion,
    updateStatus, onTriggerUpdate, onCheckForUpdates,
    storageUsage, loadingStorage,
    systemStats, systemStatsHistory, loadingSystemStats,
    logFiles, loadingFiles: loadingLogFiles,
    selectedFile: selectedLogFile, setSelectedFile: setSelectedLogFile,
    entries: logEntries, loadingEntries: loadingLogEntries,
    serverError: logsError, total: logTotal,
    levelFilter: logLevelFilter, setLevelFilter: setLogLevelFilter,
    refreshServer: refreshLogs, loadMore: loadMoreLogs, hasMore: hasMoreLogs
  } = useAdminServer({ user });

  const {
    backups, loadingBackups,
    config: backupConfig, loadingConfig: loadingBackupConfig,
    backupError, backupMessage,
    creating: creatingBackup, restoring: restoringBackup,
    onCreateBackup, onDeleteBackup, onRestoreBackup,
    onUpdateConfig: onUpdateBackupConfig,
    onPurgeExpired: onPurgeExpiredBackups,
    refreshBackups
  } = useAdminBackup({ user });

  const { handleCreateUser, handleDeleteUser, handleResetUserPassword, handlePatchUser } = useAdminCommands({
    user, setUser, setActiveView, clearAdminState, refreshAdminUsers
  });

  // ── Derived data ──────────────────────────────────────────────────────
  const manageablePlaylists = useMemo(() => {
    if (!user) {
      return [];
    }
    return availablePlaylists.filter(
      (pl) =>
        pl.authorId === user.id ||
        (pl.collaborators ?? []).includes(user.id) ||
        (pl.collaborators ?? []).includes("everyone")
    );
  }, [availablePlaylists, user]);

  const ownerNameById = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (library.ownerNamesById) {
      Object.assign(map, library.ownerNamesById);
    }
    if (user) {
      map[user.id] = user.username;
    }
    for (const adminUser of adminUsers) {
      map[adminUser.id] = adminUser.username;
    }
    return map;
  }, [user, adminUsers, library.ownerNamesById]);

  const avatarUrl = useMemo(
    () => myProfilePhotoUrl({ version: avatarVersion, userId: user?.id }),
    [avatarVersion, user?.id]
  );

  // ── Commands ──────────────────────────────────────────────────────────
  const {
    handleUpload, handleInspectUploadFile, handleRebuildIndex,
    handleDeleteTrack, handleUpdateTrackMetadata,
    handleBulkDeleteTracks, handleBulkUpdateTrackMetadata,
    handleCreatePlaylist, handleAddTrackToPlaylist,
    handlePatchPlaylist, handleDeletePlaylist,
    handleHeartPlaylist, handleReportPlaylistListen
  } = useLibraryCommands({
    manageablePlaylists, refreshCurrentLibrary, refreshAllTracks,
    refreshRecentlyUploaded, refreshPaginatedLibrary,
    removeTrackFromPlayback, setLibraryError, setAllTracksError,
    setRebuilding, setAppNotice
  });

  const {
    requestTrackPlaybackWithStatus, handleReplayRecentTrack,
    handlePlayPlaylist, handlePlayAlbum, handleNavigateTrack
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
    setPlaylistDetailId(null);
    clearSelectedArtist();
    clearSelectedArtistAlbum();
    clearSelectedAlbum();
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
    setActiveLibrarySection("home");
    setActiveConfigSection("index");
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
        onSectionChange: (section: LibrarySection) => {
          setActiveLibrarySection(section);
          setPlaylistDetailId(null);
          clearSelectedArtist();
          clearSelectedArtistAlbum();
          clearSelectedAlbum();
        },
        availablePlaylists,
        ownerNameById,
        user,
        playlistDetailId,
        onPlaylistDetailNavigate: (id: string | null) => {
          setPlaylistDetailId(id);
          navigateTo("library", "playlists", id);
        },
        onCreatePlaylist: handleCreatePlaylist,
        onPlayPlaylist: handlePlayPlaylist,
        onPatchPlaylist: handlePatchPlaylist,
        onDeletePlaylist: handleDeletePlaylist,
        onHeartPlaylist: handleHeartPlaylist,
        onReportPlaylistListen: handleReportPlaylistListen,
        autoPlaylists,
        loadingAutoPlaylists,
        forYouPlaylists,
        loadingForYouPlaylists,
        onDismissForYouPlaylist: dismissForYouPlaylist,
        allTracksById,
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
        onPlayAlbum: handlePlayAlbum,
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
        radioLoading: loadingRadio,
        radioStationId,
        radioCurrentTrack,
        radioNextTrack,
        onStartRadioPlayback: () => {
          setActiveView("player");
          startRadioPlayback();
        },
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
        onBulkDeleteTracks: handleBulkDeleteTracks,
        onBulkUpdateTrackMetadata: handleBulkUpdateTrackMetadata
      }}
      usersViewProps={{
        currentUser: user,
        users: adminUsers,
        loading: loadingAdminUsers,
        error: adminError,
        onRefresh: refreshAdminUsers,
        onCreateUser: handleCreateUser,
        onPatchUser: handlePatchUser,
        onDeleteUser: handleDeleteUser,
        onResetPassword: handleResetUserPassword
      }}
      serverViewProps={{
        versionInfo,
        loadingVersion,
        updateStatus,
        onTriggerUpdate,
        onCheckForUpdates,
        storageUsage,
        loadingStorage,
        systemStats,
        systemStatsHistory,
        loadingSystemStats,
        logFiles,
        loadingFiles: loadingLogFiles,
        selectedFile: selectedLogFile,
        onFileChange: setSelectedLogFile,
        entries: logEntries,
        loadingEntries: loadingLogEntries,
        error: logsError,
        total: logTotal,
        levelFilter: logLevelFilter,
        onLevelFilterChange: setLogLevelFilter,
        onRefresh: refreshLogs,
        onLoadMore: loadMoreLogs,
        hasMore: hasMoreLogs
      }}
      backupViewProps={{
        backups,
        loadingBackups,
        config: backupConfig,
        loadingConfig: loadingBackupConfig,
        error: backupError,
        message: backupMessage,
        creating: creatingBackup,
        restoring: restoringBackup,
        onCreateBackup,
        onDeleteBackup,
        onRestoreBackup,
        onUpdateConfig: onUpdateBackupConfig,
        onPurgeExpired: onPurgeExpiredBackups,
        onRefresh: refreshBackups
      }}
      accountViewProps={{
        user,
        avatarUrl,
        allTracksById,
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
        onNext: isRadioPlaybackLocked
          ? undefined
          : (options) => handleNavigateTrack("next", options?.wrap ?? true),
        onPrevious: isRadioPlaybackLocked
          ? undefined
          : (options) => handleNavigateTrack("previous", options?.wrap ?? true),
        onTrackPlayed: recordTrackPlayed,
        transcodeMode,
        onTranscodeModeChange: setTranscodeMode,
        repeatMode,
        onRepeatModeChange: setRepeatMode,
        shuffleEnabled,
        onShuffleEnabledChange: setShuffleEnabled,
        playRequestNonce,
        playRequestOffsetSec,
        seekLocked: isRadioPlaybackLocked,
        radioStopped: isRadioStopped,
        onStopRadioPlayback: stopRadioPlayback,
        onResumeRadioPlayback: startRadioPlayback,
        playlists: manageablePlaylists,
        onAddTrackToPlaylist: handleAddTrackToPlaylist,
        queueTracks: isRadioPlaybackLocked
          ? (selectedTrackRefreshed ? [selectedTrackRefreshed] : [])
          : refreshedQueue,
        currentQueueTrackId: selectedTrackRefreshed?.id ?? null,
        onQueueTrackSelect: isRadioPlaybackLocked
          ? undefined
          : (queueTrack) => {
            requestTrackPlaybackWithStatus(queueTrack, refreshedQueue.length > 0 ? refreshedQueue : undefined);
          }
      }}
    />
  );
}
