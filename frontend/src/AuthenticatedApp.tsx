import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { logout, myProfilePhotoUrl } from "./api";
import type { AppNotice } from "./components/AppStatusBanners";
import { AppShell } from "./components/AppShell";
import type { User } from "./types";
import type { LibrarySection } from "./types/library";
import type { ViewName } from "./utils/appUtils";
import { getTrackDisplayArtist, getTrackDisplayTitle } from "./utils/tracks";
import { useAccountActions } from "./hooks/useAccountActions";
import { useAdminCommands } from "./hooks/useAdminCommands";
import { useAdminUsers } from "./hooks/useAdminUsers";
import { useLibraryCommands } from "./hooks/useLibraryCommands";
import { useLibraryData } from "./hooks/useLibraryData";
import { usePlaybackCommands } from "./hooks/usePlaybackCommands";
import { usePlaybackState } from "./hooks/usePlaybackState";

const DEFAULT_DOCUMENT_TITLE = "Flaque Hifi Player";

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
  const [playerStatusMessage, setPlayerStatusMessage] = useState<string | null>(null);
  const [appNotice, setAppNotice] = useState<AppNotice | null>(null);
  const [playerReturnView, setPlayerReturnView] = useState<ViewName>("library");
  const [avatarVersion, setAvatarVersion] = useState(0);

  // ── Library data ──────────────────────────────────────────────────────
  const {
    filters, setFilters,
    library, allTracksLibrary, availablePlaylists,
    libraryArtists, libraryAlbums,
    selectedAlbum, selectedAlbumTracks, selectedAlbumTracksError,
    loadingLibrary, loadingAllTracks,
    loadingLibraryArtists, loadingLibraryAlbums, loadingSelectedAlbumTracks,
    libraryError, setLibraryError,
    allTracksError, setAllTracksError,
    libraryMetadataError,
    refreshCurrentLibrary, refreshAllTracks, selectAlbum
  } = useLibraryData({ user, activeView, activeLibrarySection });

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
    handleUpdateProfilePhoto, handleUpdateOwnPassword,
    handleListMySessions, handleRevokeMySession, handleLogoutOtherSessions
  } = useAccountActions({ notifyAuthStateChanged, setAppNotice, setAvatarVersion });

  // ── Side effects ──────────────────────────────────────────────────────

  useEffect(() => {
    setAvatarVersion(0);
  }, [user?.id]);

  useEffect(() => {
    if (!appNotice) {
      return;
    }
    const timer = window.setTimeout(() => setAppNotice(null), 4800);
    return () => window.clearTimeout(timer);
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
