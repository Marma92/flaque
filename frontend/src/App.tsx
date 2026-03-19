import { useEffect, useMemo, useRef, useState } from "react";

import {
  getAlbumTracks,
  getAlbums,
  getArtists,
  createPlaylist,
  createUserAccount,
  deleteTrackFile,
  deleteUserAccount,
  getAdjacentTrack,
  getCurrentUser,
  getLibrary,
  getUsers,
  inspectUploadFile,
  login,
  logout,
  patchUserAccount,
  patchPlaylist,
  resetUserPassword,
  rebuildIndex,
  updateTrackMetadata,
  uploadTracks,
  type UploadTrackPreview,
  type UploadTracksResult
} from "./api";
import { AudioPlayer, type RepeatMode, type TranscodeMode } from "./components/AudioPlayer";
import { AppHeader } from "./components/AppHeader";
import { AppStatusBanners, type AppNotice } from "./components/AppStatusBanners";
import { ConfigView } from "./components/ConfigView";
import { LibraryAlbumsSection } from "./components/LibraryAlbumsSection";
import { LibraryArtistsSection } from "./components/LibraryArtistsSection";
import { LibraryPlaylistSection } from "./components/LibraryPlaylistSection";
import { LibraryView } from "./components/LibraryView";
import { LibrarySectionSwitcher } from "./components/LibrarySectionSwitcher";
import { LoginPage } from "./components/LoginPage";
import { PlayerShell } from "./components/PlayerShell";
import { RecentTracksPanel } from "./components/RecentTracksPanel";
import { UploadView } from "./components/UploadView";
import type { AlbumEntry, ArtistEntry, LibraryResponse, Playlist, PlaylistVisibility, Track, TrackMetadataPatch, User } from "./types";
import {
  getAdjacentTrackInQueue,
  getAlbumKey,
  getViewFromLocation,
  isTrackLike,
  normalizeText,
  parseStoredQueueSnapshot,
  readShuffleMode,
  readTranscodeMode,
  sortAlbumTracksByNumber,
  syncViewToLocation,
  type StoredQueueSnapshot,
  type ViewName
} from "./utils/appUtils";
import {
  getTrackDisplayAlbum,
  getTrackDisplayArtist
} from "./utils/tracks";

type LibrarySection = "music" | "artists" | "albums" | "playlist";

const VIEW_QUERY_PARAM = "view";

const RECENT_TRACKS_STORAGE_KEY = "flaque_recent_tracks_v1";
const TRANSCODE_MODE_STORAGE_KEY = "flaque_transcode_mode_v1";
const CURRENT_QUEUE_STORAGE_KEY = "flaque_current_queue_v1";
const SHUFFLE_MODE_STORAGE_KEY = "flaque_shuffle_mode_v1";
const MAX_RECENT_TRACKS = 24;

const EMPTY_LIBRARY: LibraryResponse = {
  generatedAt: "",
  totalTracks: 0,
  totalPlaylists: 0,
  owners: [],
  artists: [],
  albums: [],
  tracks: [],
  playlists: []
};

export default function App(): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [activeView, setActiveView] = useState<ViewName>(() => getViewFromLocation(VIEW_QUERY_PARAM));
  const [activeLibrarySection, setActiveLibrarySection] = useState<LibrarySection>("music");

  const [filters, setFilters] = useState<{
    owner?: string;
    artist?: string;
    album?: string;
    q?: string;
  }>({});

  const [library, setLibrary] = useState<LibraryResponse>(EMPTY_LIBRARY);
  const [allTracksLibrary, setAllTracksLibrary] = useState<LibraryResponse>(EMPTY_LIBRARY);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingAllTracks, setLoadingAllTracks] = useState(false);
  const [libraryArtists, setLibraryArtists] = useState<ArtistEntry[]>([]);
  const [libraryAlbums, setLibraryAlbums] = useState<AlbumEntry[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumEntry | null>(null);
  const [selectedAlbumTracks, setSelectedAlbumTracks] = useState<Track[]>([]);
  const [loadingSelectedAlbumTracks, setLoadingSelectedAlbumTracks] = useState(false);
  const [selectedAlbumTracksError, setSelectedAlbumTracksError] = useState<string | null>(null);
  const [loadingLibraryArtists, setLoadingLibraryArtists] = useState(false);
  const [loadingLibraryAlbums, setLoadingLibraryAlbums] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [allTracksError, setAllTracksError] = useState<string | null>(null);
  const [libraryMetadataError, setLibraryMetadataError] = useState<string | null>(null);

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [playQueue, setPlayQueue] = useState<Track[]>([]);
  const [playRequestNonce, setPlayRequestNonce] = useState(0);
  const [transcodeMode, setTranscodeMode] = useState<TranscodeMode>(() => readTranscodeMode(TRANSCODE_MODE_STORAGE_KEY));
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffleEnabled, setShuffleEnabled] = useState<boolean>(() => readShuffleMode(SHUFFLE_MODE_STORAGE_KEY));
  const [queueRestoredFromStorage, setQueueRestoredFromStorage] = useState(false);

  const [rebuilding, setRebuilding] = useState(false);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [playerStatusMessage, setPlayerStatusMessage] = useState<string | null>(null);
  const [appNotice, setAppNotice] = useState<AppNotice | null>(null);
  const libraryRequestIdRef = useRef(0);
  const allTracksRequestIdRef = useRef(0);
  const artistsRequestIdRef = useRef(0);
  const albumsRequestIdRef = useRef(0);
  const selectedAlbumTracksRequestIdRef = useRef(0);

  const allTracksById = useMemo(() => {
    return new Map(allTracksLibrary.tracks.map((track) => [track.id, track]));
  }, [allTracksLibrary.tracks]);

  const availablePlaylists = library.playlists ?? [];

  const manageablePlaylists = useMemo(() => {
    if (!user) {
      return [];
    }

    return availablePlaylists.filter((playlist) => playlist.authorId === user.id || user.role === "admin");
  }, [availablePlaylists, user]);

  const selectedTrackRefreshed = useMemo(() => {
    if (!selectedTrack) {
      return null;
    }

    return allTracksById.get(selectedTrack.id) ?? selectedTrack;
  }, [allTracksById, selectedTrack]);

  const refreshedQueue = useMemo(() => {
    if (playQueue.length === 0) {
      return [] as Track[];
    }

    return playQueue.map((track) => allTracksById.get(track.id) ?? track);
  }, [allTracksById, playQueue]);

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

  function getAlbumTracksFromLoadedLibraries(album: AlbumEntry): Track[] {
    const selectedAlbumName = normalizeText(album.name);
    const selectedAlbumArtist = normalizeText(album.artist);
    const ownerFilter = normalizeText(filters.owner);

    const trackMap = new Map<string, Track>();
    for (const track of allTracksLibrary.tracks) {
      trackMap.set(track.id, track);
    }
    for (const track of library.tracks) {
      trackMap.set(track.id, track);
    }

    const sourceTracks = Array.from(trackMap.values());

    return sourceTracks.filter((track) => {
      if (normalizeText(getTrackDisplayAlbum(track)) !== selectedAlbumName) {
        return false;
      }

      if (ownerFilter && normalizeText(track.owner) !== ownerFilter) {
        return false;
      }

      if (!selectedAlbumArtist) {
        return true;
      }

      return normalizeText(getTrackDisplayArtist(track)) === selectedAlbumArtist;
    });
  }

  useEffect(() => {
    getCurrentUser()
      .then((nextUser) => {
        setUser(nextUser);
      })
      .finally(() => setSessionChecked(true));
  }, []);

  useEffect(() => {
    setQueueRestoredFromStorage(false);
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(RECENT_TRACKS_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }

      setRecentTracks(parsed.filter(isTrackLike).slice(0, MAX_RECENT_TRACKS));
    } catch {
      // ignore malformed local storage data
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(
        RECENT_TRACKS_STORAGE_KEY,
        JSON.stringify(recentTracks.slice(0, MAX_RECENT_TRACKS))
      );
    } catch {
      // ignore local storage write failures
    }
  }, [recentTracks]);

  useEffect(() => {
    if (!user || queueRestoredFromStorage) {
      return;
    }

    if (loadingAllTracks) {
      return;
    }

    if (selectedTrack || playQueue.length > 0) {
      setQueueRestoredFromStorage(true);
      return;
    }

    if (typeof window === "undefined") {
      setQueueRestoredFromStorage(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(CURRENT_QUEUE_STORAGE_KEY);
      if (!raw) {
        setQueueRestoredFromStorage(true);
        return;
      }

      const parsed = parseStoredQueueSnapshot(JSON.parse(raw));
      if (!parsed || parsed.userId !== user.id) {
        setQueueRestoredFromStorage(true);
        return;
      }

      const restoredQueue = parsed.trackIds
        .map((trackId) => allTracksById.get(trackId))
        .filter((track): track is Track => Boolean(track));

      if (restoredQueue.length > 0) {
        setPlayQueue(restoredQueue);
      }

      if (parsed.currentTrackId) {
        const restoredCurrentTrack =
          restoredQueue.find((track) => track.id === parsed.currentTrackId) ??
          allTracksById.get(parsed.currentTrackId);

        if (restoredCurrentTrack) {
          setSelectedTrack(restoredCurrentTrack);
        }
      }
    } catch {
      // ignore malformed local storage queue
    } finally {
      setQueueRestoredFromStorage(true);
    }
  }, [allTracksById, loadingAllTracks, playQueue.length, queueRestoredFromStorage, selectedTrack, user]);

  useEffect(() => {
    if (!user || typeof window === "undefined") {
      return;
    }

    const queueSource = refreshedQueue.length > 0 ? refreshedQueue : selectedTrackRefreshed ? [selectedTrackRefreshed] : [];

    if (queueSource.length === 0) {
      window.localStorage.removeItem(CURRENT_QUEUE_STORAGE_KEY);
      return;
    }

    try {
      const payload: StoredQueueSnapshot = {
        userId: user.id,
        trackIds: queueSource.map((track) => track.id),
        currentTrackId: selectedTrackRefreshed?.id ?? null
      };

      window.localStorage.setItem(CURRENT_QUEUE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore local storage write failures
    }
  }, [refreshedQueue, selectedTrackRefreshed, user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(TRANSCODE_MODE_STORAGE_KEY, transcodeMode);
  }, [transcodeMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SHUFFLE_MODE_STORAGE_KEY, shuffleEnabled ? "on" : "off");
  }, [shuffleEnabled]);

  useEffect(() => {
    if (!user) {
      setLibrary(EMPTY_LIBRARY);
      setAllTracksLibrary(EMPTY_LIBRARY);
      setLibraryArtists([]);
      setLibraryAlbums([]);
      setLoadingLibrary(false);
      setLoadingAllTracks(false);
      setLoadingLibraryArtists(false);
      setLoadingLibraryAlbums(false);
      setLibraryError(null);
      setAllTracksError(null);
      setLibraryMetadataError(null);
      return;
    }

    const requestId = libraryRequestIdRef.current + 1;
    libraryRequestIdRef.current = requestId;

    setLoadingLibrary(true);
    setLibraryError(null);

    getLibrary(filters)
      .then((payload) => {
        if (libraryRequestIdRef.current !== requestId) {
          return;
        }
        setLibrary(payload);
      })
      .catch((error) => {
        if (libraryRequestIdRef.current !== requestId) {
          return;
        }
        setLibraryError(error instanceof Error ? error.message : "Failed to load library");
      })
      .finally(() => {
        if (libraryRequestIdRef.current === requestId) {
          setLoadingLibrary(false);
        }
      });
  }, [user, filters]);

  useEffect(() => {
    if (!user || activeView !== "library" || activeLibrarySection !== "artists") {
      return;
    }

    const requestId = artistsRequestIdRef.current + 1;
    artistsRequestIdRef.current = requestId;

    setLoadingLibraryArtists(true);
    setLibraryMetadataError(null);

    getArtists({
      owner: filters.owner,
      q: filters.q
    })
      .then((artists) => {
        if (artistsRequestIdRef.current !== requestId) {
          return;
        }
        setLibraryArtists(artists);
      })
      .catch((error) => {
        if (artistsRequestIdRef.current !== requestId) {
          return;
        }
        setLibraryMetadataError(error instanceof Error ? error.message : "Failed to load artists");
      })
      .finally(() => {
        if (artistsRequestIdRef.current === requestId) {
          setLoadingLibraryArtists(false);
        }
      });
  }, [activeLibrarySection, activeView, filters.owner, filters.q, user]);

  useEffect(() => {
    if (!user || activeView !== "library" || activeLibrarySection !== "albums") {
      return;
    }

    const requestId = albumsRequestIdRef.current + 1;
    albumsRequestIdRef.current = requestId;

    setLoadingLibraryAlbums(true);
    setLibraryMetadataError(null);

    getAlbums({
      owner: filters.owner,
      artist: filters.artist,
      q: filters.q
    })
      .then((albums) => {
        if (albumsRequestIdRef.current !== requestId) {
          return;
        }
        setLibraryAlbums(albums);
      })
      .catch((error) => {
        if (albumsRequestIdRef.current !== requestId) {
          return;
        }
        setLibraryMetadataError(error instanceof Error ? error.message : "Failed to load albums");
      })
      .finally(() => {
        if (albumsRequestIdRef.current === requestId) {
          setLoadingLibraryAlbums(false);
        }
      });
  }, [activeLibrarySection, activeView, filters.artist, filters.owner, filters.q, user]);

  useEffect(() => {
    if (activeLibrarySection !== "albums") {
      setSelectedAlbum(null);
      setSelectedAlbumTracks([]);
      setSelectedAlbumTracksError(null);
      setLoadingSelectedAlbumTracks(false);
      return;
    }

    setSelectedAlbum((current) => {
      if (!current) {
        return null;
      }

      const currentKey = getAlbumKey(current);
      return libraryAlbums.some((album) => getAlbumKey(album) === currentKey) ? current : null;
    });
  }, [activeLibrarySection, libraryAlbums]);

  useEffect(() => {
    if (activeLibrarySection !== "albums" || !selectedAlbum) {
      return;
    }

    const fallbackTracks = getAlbumTracksFromLoadedLibraries(selectedAlbum);

    if (!selectedAlbum.id) {
      setSelectedAlbumTracks(sortAlbumTracksByNumber(fallbackTracks));
      setSelectedAlbumTracksError(null);
      setLoadingSelectedAlbumTracks(false);
      return;
    }

    const requestId = selectedAlbumTracksRequestIdRef.current + 1;
    selectedAlbumTracksRequestIdRef.current = requestId;

    setLoadingSelectedAlbumTracks(true);
    setSelectedAlbumTracksError(null);

    getAlbumTracks(selectedAlbum.id)
      .then((tracks) => {
        if (selectedAlbumTracksRequestIdRef.current !== requestId) {
          return;
        }
        setSelectedAlbumTracks(sortAlbumTracksByNumber(tracks));
      })
      .catch((error) => {
        if (selectedAlbumTracksRequestIdRef.current !== requestId) {
          return;
        }

        setSelectedAlbumTracks(sortAlbumTracksByNumber(fallbackTracks));
        setSelectedAlbumTracksError(error instanceof Error ? error.message : "Failed to load album tracks");
      })
      .finally(() => {
        if (selectedAlbumTracksRequestIdRef.current === requestId) {
          setLoadingSelectedAlbumTracks(false);
        }
      });
  }, [
    activeLibrarySection,
    allTracksLibrary.tracks,
    filters.owner,
    library.tracks,
    selectedAlbum
  ]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const requestId = allTracksRequestIdRef.current + 1;
    allTracksRequestIdRef.current = requestId;

    setLoadingAllTracks(true);
    setAllTracksError(null);

    getLibrary({})
      .then((payload) => {
        if (allTracksRequestIdRef.current !== requestId) {
          return;
        }
        setAllTracksLibrary(payload);
      })
      .catch((error) => {
        if (allTracksRequestIdRef.current !== requestId) {
          return;
        }
        setAllTracksError(error instanceof Error ? error.message : "Failed to load tracks");
      })
      .finally(() => {
        if (allTracksRequestIdRef.current === requestId) {
          setLoadingAllTracks(false);
        }
      });
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== "admin") {
      return;
    }

    setLoadingAdminUsers(true);
    setAdminError(null);

    getUsers()
      .then((users) => {
        setAdminUsers(users);
      })
      .catch((error) => {
        setAdminError(error instanceof Error ? error.message : "Failed to load users");
      })
      .finally(() => {
        setLoadingAdminUsers(false);
      });
  }, [user]);

  useEffect(() => {
    if (!user || user.role === "admin") {
      return;
    }

    if (activeView === "config") {
      setActiveView("library");
    }
  }, [user, activeView]);

  useEffect(() => {
    const onPopState = () => {
      const requestedView = getViewFromLocation(VIEW_QUERY_PARAM);
      if (requestedView === "config" && user?.role !== "admin") {
        setActiveView("library");
        return;
      }

      setActiveView(requestedView);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [user?.role]);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }

    const resolvedView = activeView === "config" && user?.role !== "admin" ? "library" : activeView;
    if (resolvedView !== activeView) {
      setActiveView(resolvedView);
      return;
    }

    syncViewToLocation(resolvedView, VIEW_QUERY_PARAM);
  }, [activeView, sessionChecked, user?.role]);

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

  async function refreshCurrentLibrary(): Promise<void> {
    const requestId = libraryRequestIdRef.current + 1;
    libraryRequestIdRef.current = requestId;

    setLoadingLibrary(true);
    setLibraryError(null);

    try {
      const payload = await getLibrary(filters);
      if (libraryRequestIdRef.current !== requestId) {
        return;
      }
      setLibrary(payload);
    } catch (error) {
      if (libraryRequestIdRef.current !== requestId) {
        return;
      }
      setLibraryError(error instanceof Error ? error.message : "Failed to load library");
    } finally {
      if (libraryRequestIdRef.current === requestId) {
        setLoadingLibrary(false);
      }
    }
  }

  async function refreshAllTracks(): Promise<void> {
    const requestId = allTracksRequestIdRef.current + 1;
    allTracksRequestIdRef.current = requestId;

    setLoadingAllTracks(true);
    setAllTracksError(null);

    try {
      const payload = await getLibrary({});
      if (allTracksRequestIdRef.current !== requestId) {
        return;
      }
      setAllTracksLibrary(payload);
    } catch (error) {
      if (allTracksRequestIdRef.current !== requestId) {
        return;
      }
      setAllTracksError(error instanceof Error ? error.message : "Failed to load tracks");
    } finally {
      if (allTracksRequestIdRef.current === requestId) {
        setLoadingAllTracks(false);
      }
    }
  }

  async function handleLogin(username: string, password: string): Promise<void> {
    const authenticatedUser = await login(username, password);
    setUser(authenticatedUser);
    setActiveView("library");
    setActiveLibrarySection("music");
  }

  async function handleLogout(): Promise<void> {
    await logout();
    setUser(null);
    setSelectedTrack(null);
    setPlayQueue([]);
    setRepeatMode("off");
    setShuffleEnabled(false);
    setActiveLibrarySection("music");
    setFilters({});
    setAdminUsers([]);
    setAdminError(null);
    setLibraryError(null);
    setAllTracksError(null);
  }

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

    setAppNotice({
      tone: "success",
      message: `Upload complete: ${result.uploaded}/${result.processed} file${result.processed > 1 ? "s" : ""} stored.`
    });

    return result;
  }

  async function handleInspectUploadFile(file: File): Promise<UploadTrackPreview> {
    return inspectUploadFile(file);
  }

  async function handleRebuildIndex(): Promise<void> {
    setRebuilding(true);
    setLibraryError(null);
    setAllTracksError(null);

    try {
      await rebuildIndex();
      await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
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

  async function refreshAdminUsers(): Promise<void> {
    setLoadingAdminUsers(true);
    setAdminError(null);
    try {
      const users = await getUsers();
      setAdminUsers(users);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Failed to load users");
    } finally {
      setLoadingAdminUsers(false);
    }
  }

  async function handleCreateUser(input: {
    username: string;
    password: string;
    role: "user" | "admin";
  }): Promise<void> {
    await createUserAccount(input);
    await refreshAdminUsers();
  }

  async function handleDeleteUser(userId: string): Promise<void> {
    await deleteUserAccount(userId);
    await refreshAdminUsers();
  }

  async function handleResetUserPassword(userId: string, password: string): Promise<void> {
    await resetUserPassword(userId, password);
  }

  async function handlePatchUser(input: {
    userId: string;
    username?: string;
    role?: "user" | "admin";
  }): Promise<void> {
    const patchedUser = await patchUserAccount(input.userId, {
      username: input.username,
      role: input.role
    });

    if (user && patchedUser.id === user.id) {
      setUser(patchedUser);

      if (patchedUser.role !== "admin") {
        setActiveView("library");
        setAdminUsers([]);
        setAdminError(null);
        return;
      }
    }

    await refreshAdminUsers();
  }

  async function handleDeleteTrack(trackId: string): Promise<void> {
    await deleteTrackFile(trackId);

    if (selectedTrackRefreshed?.id === trackId) {
      setSelectedTrack(null);
    }

    setPlayQueue((current) => current.filter((track) => track.id !== trackId));
    setRecentTracks((current) => current.filter((track) => track.id !== trackId));

    setAppNotice({
      tone: "success",
      message: "Track deleted from the library."
    });

    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
  }

  async function handleUpdateTrackMetadata(trackId: string, patch: TrackMetadataPatch): Promise<void> {
    await updateTrackMetadata(trackId, patch);
    setAppNotice({
      tone: "success",
      message: "Track metadata updated."
    });
    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
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
  }

  async function handleNavigateTrack(direction: "next" | "previous", wrap = true): Promise<void> {
    const currentTrack = selectedTrackRefreshed;
    if (!currentTrack) {
      return;
    }

    setPlayerStatusMessage(null);

    if (shuffleEnabled && direction === "next") {
      const shufflePool = refreshedQueue.length > 0 ? refreshedQueue : allTracksLibrary.tracks;
      const shuffleCandidates = shufflePool.filter((track) => track.id !== currentTrack.id);

      if (shuffleCandidates.length > 0) {
        const randomIndex = Math.floor(Math.random() * shuffleCandidates.length);
        const randomTrack = shuffleCandidates[randomIndex] ?? null;
        if (randomTrack) {
          setSelectedTrack(randomTrack);
          return;
        }
      }

      if (!wrap) {
        setPlayerStatusMessage("Shuffle has no additional track in the current queue.");
      }
      return;
    }

    const nextTrackFromQueue = getAdjacentTrackInQueue(refreshedQueue, currentTrack.id, direction, wrap);
    if (nextTrackFromQueue && nextTrackFromQueue.id !== currentTrack.id) {
      setSelectedTrack(nextTrackFromQueue);
      return;
    }

    try {
      const adjacentTrack = await getAdjacentTrack({
        trackId: currentTrack.id,
        direction,
        wrap,
        owner: filters.owner,
        artist: filters.artist,
        album: filters.album,
        q: filters.q
      });

      if (!adjacentTrack || adjacentTrack.id === currentTrack.id) {
        if (!wrap) {
          setPlayerStatusMessage(
            direction === "next"
              ? "You reached the end of the current queue."
              : "You are already at the start of the current queue."
          );
        }
        return;
      }

      setSelectedTrack(adjacentTrack);
    } catch (error) {
      setPlayerStatusMessage("Unable to change track right now.");
      setLibraryError(error instanceof Error ? error.message : "Unable to navigate tracks");
      setAppNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to navigate tracks"
      });
    }
  }

  function handleTrackPlayed(track: Track): void {
    setRecentTracks((current) => {
      const withoutCurrent = current.filter((entry) => entry.id !== track.id);
      return [track, ...withoutCurrent].slice(0, MAX_RECENT_TRACKS);
    });
  }

  function requestTrackPlayback(track: Track, queueSource?: Track[]): void {
    const source = queueSource && queueSource.length > 0 ? queueSource : allTracksLibrary.tracks;
    setPlayQueue(source.length > 0 ? source : [track]);

    setPlayerStatusMessage(null);
    setSelectedTrack(track);
    setPlayRequestNonce((current) => current + 1);
  }

  function handleReplayRecentTrack(track: Track): void {
    const fullTrack = allTracksById.get(track.id) ?? track;
    requestTrackPlayback(fullTrack, allTracksLibrary.tracks.length > 0 ? allTracksLibrary.tracks : undefined);
  }

  function handlePlayPlaylist(playlist: Playlist): void {
    const playlistTracks = playlist.trackIds
      .map((trackId) => allTracksById.get(trackId))
      .filter((track): track is Track => Boolean(track));

    if (playlistTracks.length === 0) {
      setLibraryError("This playlist has no playable tracks in the current index.");
      return;
    }

    setLibraryError(null);
    requestTrackPlayback(playlistTracks[0], playlistTracks);
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
        <div className="space-y-4">
          <LibrarySectionSwitcher activeSection={activeLibrarySection} onSectionChange={setActiveLibrarySection} />

          {activeLibrarySection === "playlist" ? (
            <LibraryPlaylistSection
              availablePlaylists={availablePlaylists}
              ownerNameById={ownerNameById}
              onCreatePlaylist={handleCreatePlaylist}
              onPlayPlaylist={handlePlayPlaylist}
            />
          ) : null}

          {activeLibrarySection === "artists" ? (
            <LibraryArtistsSection
              libraryMetadataError={libraryMetadataError}
              loadingArtists={loadingLibraryArtists}
              artists={libraryArtists}
            />
          ) : null}

          {activeLibrarySection === "albums" ? (
            <LibraryAlbumsSection
              libraryMetadataError={libraryMetadataError}
              loadingAlbums={loadingLibraryAlbums}
              albums={libraryAlbums}
              selectedAlbum={selectedAlbum}
              selectedAlbumTracks={selectedAlbumTracks}
              loadingSelectedAlbumTracks={loadingSelectedAlbumTracks}
              selectedAlbumTracksError={selectedAlbumTracksError}
              currentTrackId={selectedTrackRefreshed?.id}
              ownerNameById={ownerNameById}
              onAlbumSelect={(album) => {
                setSelectedAlbum(album);
                setSelectedAlbumTracks([]);
                setSelectedAlbumTracksError(null);
              }}
              onTrackSelect={(track) => requestTrackPlayback(track, selectedAlbumTracks)}
            />
          ) : null}

          {activeLibrarySection === "music" ? (
            <>
              <RecentTracksPanel tracks={recentTracks} onTrackReplay={handleReplayRecentTrack} />

              <LibraryView
                generatedAt={library.generatedAt}
                tracks={library.tracks}
                owners={library.owners}
                ownerNameById={ownerNameById}
                artists={library.artists}
                albums={library.albums}
                filters={filters}
                onFilterChange={setFilters}
                currentTrackId={selectedTrackRefreshed?.id}
                onTrackSelect={(track) => {
                  requestTrackPlayback(track, library.tracks);
                }}
              />
            </>
          ) : null}
        </div>
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
              onTrackPlayed={handleTrackPlayed}
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
                requestTrackPlayback(queueTrack, refreshedQueue.length > 0 ? refreshedQueue : undefined);
              }}
              onArtworkClick={activeView === "player" ? undefined : () => setActiveView("player")}
            />
        </PlayerShell>
      ) : null}
    </main>
  );
}
