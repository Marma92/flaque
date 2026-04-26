import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { logout, myProfilePhotoUrl } from "./api";
import { AppShell } from "./components/AppShell";
import type { ConfigSection } from "./components/ConfigView";
import type { Track, User } from "./types";
import type { LibrarySection } from "./types/library";
import { navigateTo, normalizeText, sortAlbumTracksByNumber, type ViewName } from "./utils/appUtils";
import { getTrackDisplayAlbum, getTrackDisplayArtist } from "./utils/tracks";
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
    items: recentlyUploadedItems,
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
  const { forYouPlaylists, loading: loadingForYouPlaylists, dismiss: dismissForYouPlaylist, regenerate: regenerateForYouPlaylists } = useForYouPlaylists();

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
  const { adminUsers, clearAdminState } = useAdminUsers({ user });


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

  const handleOpenCurrentTrackArtist = useCallback((): void => {
    if (!selectedTrackRefreshed) {
      return;
    }

    const artistName = getTrackDisplayArtist(selectedTrackRefreshed);
    if (!artistName) {
      return;
    }

    const targetArtist = normalizeText(artistName);
    const matchedArtist =
      libraryArtists.find((entry) => normalizeText(entry.name) === targetArtist) ??
      library.artists.find((entry) => normalizeText(entry.name) === targetArtist);
    const artistEntry = matchedArtist ?? {
      name: artistName,
      normalizedName: targetArtist,
      albumCount: 0,
      trackCount: 0,
      totalDuration: 0,
      previewTrackId: selectedTrackRefreshed.id
    };

    navigateTo("library", "artists");
    setActiveView("library");
    setActiveLibrarySection("artists");
    setPlaylistDetailId(null);
    clearSelectedAlbum();
    clearSelectedArtistAlbum();
    selectArtist(artistEntry);
  }, [
    clearSelectedAlbum,
    clearSelectedArtistAlbum,
    library.artists,
    libraryArtists,
    selectArtist,
    selectedTrackRefreshed,
    setActiveLibrarySection,
    setActiveView,
    setPlaylistDetailId
  ]);

  const handleOpenCurrentTrackAlbum = useCallback((): void => {
    if (!selectedTrackRefreshed) {
      return;
    }

    const albumName = getTrackDisplayAlbum(selectedTrackRefreshed);
    if (!albumName) {
      return;
    }

    const artistName = getTrackDisplayArtist(selectedTrackRefreshed);
    const targetName = normalizeText(albumName);
    const targetArtist = normalizeText(artistName);
    const matchAlbum = (name: string, artist?: string): boolean => {
      if (normalizeText(name) !== targetName) {
        return false;
      }

      if (!targetArtist) {
        return true;
      }

      return normalizeText(artist) === targetArtist;
    };

    const matchedAlbum =
      libraryAlbums.find((entry) => matchAlbum(entry.name, entry.artist)) ??
      library.albums.find((entry) => matchAlbum(entry.name, entry.artist));
    const albumEntry = matchedAlbum ?? {
      name: albumName,
      artist: artistName,
      trackCount: 0,
      cover: selectedTrackRefreshed.cover,
      previewTrackId: selectedTrackRefreshed.id
    };

    navigateTo("library", "albums");
    setActiveView("library");
    setActiveLibrarySection("albums");
    setPlaylistDetailId(null);
    clearSelectedArtist();
    clearSelectedArtistAlbum();
    selectAlbum(albumEntry);
  }, [
    clearSelectedArtist,
    clearSelectedArtistAlbum,
    library.albums,
    libraryAlbums,
    selectAlbum,
    selectedTrackRefreshed,
    setActiveLibrarySection,
    setActiveView,
    setPlaylistDetailId
  ]);

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
        playlistsProps: {
          playlistDetailId,
          onPlaylistDetailNavigate: (id: string | null) => {
            setPlaylistDetailId(id);
            navigateTo("library", "playlists", id);
          },
          availablePlaylists,
          manageablePlaylists,
          ownerNameById,
          allTracksById,
          user,
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
          onRefreshForYouPlaylists: regenerateForYouPlaylists
        },
        artistsProps: {
          libraryMetadataError,
          loadingArtists: loadingLibraryArtists,
          artists: libraryArtists,
          selectedArtist,
          artistAlbums,
          selectedArtistAlbum,
          selectedArtistAlbumTracks,
          loadingSelectedArtistAlbumTracks,
          selectedArtistAlbumTracksError,
          loadingArtistAlbums,
          currentTrackId: selectedTrackRefreshed?.id,
          ownerNameById,
          onArtistSelect: selectArtist,
          onArtistBack: clearSelectedArtist,
          onArtistAlbumSelect: selectArtistAlbum,
          onArtistAlbumBack: clearSelectedArtistAlbum,
          onArtistAlbumTrackSelect: (track) => requestTrackPlaybackWithStatus(track, selectedArtistAlbumTracks),
          onPlayAlbum: handlePlayAlbum,
          playlists: manageablePlaylists,
          onAddTrackToPlaylist: handleAddTrackToPlaylist
        },
        albumsProps: {
          libraryMetadataError,
          loadingAlbums: loadingLibraryAlbums,
          albums: libraryAlbums,
          selectedAlbum,
          selectedAlbumTracks,
          loadingSelectedAlbumTracks,
          selectedAlbumTracksError,
          currentTrackId: selectedTrackRefreshed?.id,
          ownerNameById,
          onAlbumSelect: selectAlbum,
          onPlayAlbum: handlePlayAlbum,
          onBack: clearSelectedAlbum,
          onTrackSelect: (track) => requestTrackPlaybackWithStatus(track, selectedAlbumTracks),
          playlists: manageablePlaylists,
          onAddTrackToPlaylist: handleAddTrackToPlaylist
        },
        homeProps: {
          recentTracks,
          onRecentTrackReplay: handleReplayRecentTrack,
          recentlyUploadedItems,
          recentlyUploadedLoading,
          recentlyUploadedPeriod,
          onRecentlyUploadedPeriodChange: setRecentlyUploadedPeriod,
          onRecentlyUploadedTrackSelect: (track) => requestTrackPlaybackWithStatus(track, paginatedTracks),
          onRecentlyUploadedAlbumPlay: (album) => {
            const sortedTracks = sortAlbumTracksByNumber(album.tracks);
            if (sortedTracks.length === 0) return;
            requestTrackPlaybackWithStatus(sortedTracks[0], sortedTracks);
          },
          onRecentlyUploadedAlbumOpen: (album) => {
            const targetName = normalizeText(album.albumName);
            const targetArtist = normalizeText(album.artist);
            const matched =
              libraryAlbums.find((entry) =>
                normalizeText(entry.name) === targetName &&
                normalizeText(entry.artist) === targetArtist
              ) ??
              library.albums.find((entry) =>
                normalizeText(entry.name) === targetName &&
                normalizeText(entry.artist) === targetArtist
              );
            const albumEntry = matched ?? {
              name: album.albumName,
              artist: album.artist,
              trackCount: album.trackCount,
              cover: album.coverTrackId
            };
            navigateTo("library", "albums");
            setActiveLibrarySection("albums");
            setPlaylistDetailId(null);
            clearSelectedArtist();
            clearSelectedArtistAlbum();
            selectAlbum(albumEntry);
          },
          ownerNameById,
          radioLoading: loadingRadio,
          radioStationId,
          radioCurrentTrack,
          radioNextTrack,
          onStartRadioPlayback: () => {
            setActiveView("player");
            startRadioPlayback();
          },
          onNavigateToLibrary: () => {
            navigateTo("library", "music");
            setActiveLibrarySection("music");
            setPlaylistDetailId(null);
            clearSelectedArtist();
            clearSelectedArtistAlbum();
            clearSelectedAlbum();
          }
        },
        musicProps: {
          owners: library.owners,
          ownerNameById,
          artists: library.artists,
          albums: library.albums,
          filters,
          onFilterChange: (next) => setFilters(next),
          tracks: paginatedTracks,
          total: paginatedTotal,
          loading: paginatedLoading,
          loadingMore: paginatedLoadingMore,
          hasMore: paginatedHasMore,
          sentinelRef: paginatedSentinelRef,
          currentTrackId: selectedTrackRefreshed?.id,
          onTrackSelect: (track) => requestTrackPlaybackWithStatus(track, paginatedTracks),
          playlists: manageablePlaylists,
          onAddTrackToPlaylist: handleAddTrackToPlaylist
        }
      }}
      onLibrarySectionChange={setActiveLibrarySection}
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
      setUser={setUser}
      setActiveView={setActiveView}
      setAppNotice={setAppNotice}
      allTracksById={allTracksById}
      setAvatarVersion={setAvatarVersion}
      notifyAuthStateChanged={notifyAuthStateChanged}
      onAutoPlaylistsRegenerated={refreshAutoPlaylists}
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
          },
        onOpenTrackArtist: handleOpenCurrentTrackArtist,
        onOpenTrackAlbum: handleOpenCurrentTrackAlbum
      }}
    />
  );
}
