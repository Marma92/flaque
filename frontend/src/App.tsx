import { useEffect, useMemo, useState } from "react";

import {
  coverUrl,
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
import defaultCoverImage from "./assets/default-cover.png";
import { AudioPlayer, type RepeatMode, type TranscodeMode } from "./components/AudioPlayer";
import { ConfigView } from "./components/ConfigView";
import { LibraryView } from "./components/LibraryView";
import { LoginPage } from "./components/LoginPage";
import { UploadView } from "./components/UploadView";
import type { LibraryResponse, Playlist, PlaylistVisibility, Track, TrackMetadataPatch, User } from "./types";
import {
  getTrackDisplayAlbumWithYear,
  getTrackDisplayArtist,
  getTrackDisplayTitle
} from "./utils/tracks";

type ViewName = "library" | "upload" | "player" | "config";

type NoticeTone = "success" | "error" | "info";

type AppNotice = {
  tone: NoticeTone;
  message: string;
};

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

function isTrackLike(value: unknown): value is Track {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    id?: unknown;
    owner?: unknown;
    path?: unknown;
    duration?: unknown;
    mimeType?: unknown;
    codec?: unknown;
    tags?: unknown;
  };

  return (
    typeof candidate.id === "string" &&
    typeof candidate.owner === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.duration === "number" &&
    typeof candidate.mimeType === "string" &&
    typeof candidate.codec === "string" &&
    Boolean(candidate.tags) &&
    typeof candidate.tags === "object"
  );
}

type StoredQueueSnapshot = {
  userId: string;
  trackIds: string[];
  currentTrackId: string | null;
};

function parseStoredQueueSnapshot(value: unknown): StoredQueueSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    userId?: unknown;
    trackIds?: unknown;
    currentTrackId?: unknown;
  };

  if (typeof candidate.userId !== "string" || !candidate.userId.trim()) {
    return null;
  }

  if (!Array.isArray(candidate.trackIds)) {
    return null;
  }

  const deduplicated = new Set<string>();
  const trackIds: string[] = [];

  for (const entry of candidate.trackIds) {
    if (typeof entry !== "string") {
      continue;
    }

    const trimmed = entry.trim();
    if (!trimmed || deduplicated.has(trimmed)) {
      continue;
    }

    deduplicated.add(trimmed);
    trackIds.push(trimmed);
  }

  const currentTrackId =
    typeof candidate.currentTrackId === "string" && candidate.currentTrackId.trim()
      ? candidate.currentTrackId.trim()
      : null;

  return {
    userId: candidate.userId.trim(),
    trackIds,
    currentTrackId
  };
}

function readTranscodeMode(): TranscodeMode {
  if (typeof window === "undefined") {
    return "original";
  }

  const stored = window.localStorage.getItem(TRANSCODE_MODE_STORAGE_KEY);
  if (stored === "opus" || stored === "mp3" || stored === "original") {
    return stored;
  }

  return "original";
}

function readShuffleMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SHUFFLE_MODE_STORAGE_KEY) === "on";
}

function getAdjacentTrackInQueue(
  queue: Track[],
  currentTrackId: string,
  direction: "next" | "previous",
  wrap = true
): Track | null {
  if (queue.length === 0) {
    return null;
  }

  const currentIndex = queue.findIndex((track) => track.id === currentTrackId);
  if (currentIndex < 0) {
    return null;
  }

  if (queue.length === 1) {
    return wrap ? queue[0] ?? null : null;
  }

  const offset = direction === "next" ? 1 : -1;
  const targetIndex = currentIndex + offset;

  if (targetIndex < 0 || targetIndex >= queue.length) {
    if (!wrap) {
      return null;
    }

    return direction === "next" ? queue[0] ?? null : queue[queue.length - 1] ?? null;
  }

  return queue[targetIndex] ?? null;
}

function parseViewParam(rawValue: string | null): ViewName | null {
  if (rawValue === "library" || rawValue === "upload" || rawValue === "player" || rawValue === "config") {
    return rawValue;
  }

  return null;
}

function getViewFromLocation(): ViewName {
  if (typeof window === "undefined") {
    return "library";
  }

  const view = parseViewParam(new URLSearchParams(window.location.search).get(VIEW_QUERY_PARAM));
  return view ?? "library";
}

function syncViewToLocation(view: ViewName): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get(VIEW_QUERY_PARAM) === view) {
    return;
  }

  url.searchParams.set(VIEW_QUERY_PARAM, view);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function App(): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [activeView, setActiveView] = useState<ViewName>(() => getViewFromLocation());

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
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [allTracksError, setAllTracksError] = useState<string | null>(null);

  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [playQueue, setPlayQueue] = useState<Track[]>([]);
  const [playRequestNonce, setPlayRequestNonce] = useState(0);
  const [transcodeMode, setTranscodeMode] = useState<TranscodeMode>(() => readTranscodeMode());
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [shuffleEnabled, setShuffleEnabled] = useState<boolean>(() => readShuffleMode());
  const [queueRestoredFromStorage, setQueueRestoredFromStorage] = useState(false);

  const [rebuilding, setRebuilding] = useState(false);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const [playlistCreateName, setPlaylistCreateName] = useState("");
  const [playlistCreateVisibility, setPlaylistCreateVisibility] = useState<PlaylistVisibility>("private");
  const [playlistCreateSubmitting, setPlaylistCreateSubmitting] = useState(false);
  const [playlistCreateStatus, setPlaylistCreateStatus] = useState<string | null>(null);
  const [playerStatusMessage, setPlayerStatusMessage] = useState<string | null>(null);
  const [appNotice, setAppNotice] = useState<AppNotice | null>(null);

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
      setLoadingLibrary(false);
      setLoadingAllTracks(false);
      setLibraryError(null);
      setAllTracksError(null);
      return;
    }

    let cancelled = false;

    setLoadingLibrary(true);
    setLibraryError(null);

    getLibrary(filters)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setLibrary(payload);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLibraryError(error instanceof Error ? error.message : "Failed to load library");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingLibrary(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, filters]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    setLoadingAllTracks(true);
    setAllTracksError(null);

    getLibrary({})
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setAllTracksLibrary(payload);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setAllTracksError(error instanceof Error ? error.message : "Failed to load tracks");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingAllTracks(false);
        }
      });

    return () => {
      cancelled = true;
    };
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
      const requestedView = getViewFromLocation();
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

    syncViewToLocation(resolvedView);
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
    setLoadingLibrary(true);
    setLibraryError(null);

    try {
      const payload = await getLibrary(filters);
      setLibrary(payload);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Failed to load library");
    } finally {
      setLoadingLibrary(false);
    }
  }

  async function refreshAllTracks(): Promise<void> {
    setLoadingAllTracks(true);
    setAllTracksError(null);

    try {
      const payload = await getLibrary({});
      setAllTracksLibrary(payload);
    } catch (error) {
      setAllTracksError(error instanceof Error ? error.message : "Failed to load tracks");
    } finally {
      setLoadingAllTracks(false);
    }
  }

  async function handleLogin(username: string, password: string): Promise<void> {
    const authenticatedUser = await login(username, password);
    setUser(authenticatedUser);
    setActiveView("library");
  }

  async function handleLogout(): Promise<void> {
    await logout();
    setUser(null);
    setSelectedTrack(null);
    setPlayQueue([]);
    setRepeatMode("off");
    setShuffleEnabled(false);
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
      className={`mx-auto min-h-screen w-full max-w-7xl px-4 pt-6 md:px-6 ${
        hasStickyPlayer ? "pb-[calc(18rem+env(safe-area-inset-bottom))]" : "pb-[calc(2.5rem+env(safe-area-inset-bottom))]"
      }`}
    >
      <header className="mb-4 rounded-3xl border border-flaque-clay/60 bg-white/80 px-5 py-4 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 md:h-24 md:w-24">
              <img
                className="header-logo-light absolute inset-0 h-full w-full object-contain"
                src="/favicon.png"
                alt="Flaque logo"
              />
              <img
                className="header-logo-dark absolute inset-0 h-full w-full object-contain"
                src="/logo-dark.png"
                alt="Flaque logo (dark mode)"
              />
            </div>
            <h1 className="font-display text-base leading-tight text-flaque-ink sm:text-lg md:text-xl lg:text-2xl">
              File-based Library Audio Query Engine
            </h1>
          </div>

          <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 pr-10 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0 sm:pr-0">
            <button
              className={`rounded-xl px-4 py-2 text-sm transition ${
                activeView === "library"
                  ? "bg-flaque-ink text-flaque-cream"
                  : "border border-flaque-clay bg-white text-flaque-ink"
              }`}
              type="button"
              onClick={() => setActiveView("library")}
            >
              Library
            </button>
            <button
              className={`rounded-xl px-4 py-2 text-sm transition ${
                activeView === "upload"
                  ? "bg-flaque-ink text-flaque-cream"
                  : "border border-flaque-clay bg-white text-flaque-ink"
              }`}
              type="button"
              onClick={() => setActiveView("upload")}
            >
              Upload
            </button>
            <button
              className={`rounded-xl px-4 py-2 text-sm transition ${
                activeView === "player"
                  ? "bg-flaque-ink text-flaque-cream"
                  : "border border-flaque-clay bg-white text-flaque-ink"
              }`}
              type="button"
              onClick={() => setActiveView("player")}
            >
              Player
            </button>
            {user.role === "admin" ? (
              <button
                className={`rounded-xl px-4 py-2 text-sm transition ${
                  activeView === "config"
                    ? "bg-flaque-ink text-flaque-cream"
                    : "border border-flaque-clay bg-white text-flaque-ink"
                }`}
                type="button"
                onClick={() => setActiveView("config")}
              >
                Config
              </button>
            ) : null}

            <button
              className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream"
              type="button"
              onClick={handleLogout}
            >
              Logout ({user.username})
            </button>
          </div>
        </div>
      </header>

      {appNotice ? (
        <div
          className={`mb-4 rounded-xl border px-3 py-2 text-sm ${
            appNotice.tone === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : appNotice.tone === "error"
                ? "border-red-300 bg-red-50 text-red-700"
                : "border-flaque-clay bg-flaque-cream/70 text-flaque-steel"
          }`}
          role="status"
          aria-live="polite"
        >
          {appNotice.message}
        </div>
      ) : null}

      {libraryError ? (
        <p className="mb-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {libraryError}
        </p>
      ) : null}

      {activeView === "library" && loadingLibrary ? (
        <p className="mb-4 text-sm text-flaque-steel">Refreshing library index...</p>
      ) : null}

      {activeView === "library" ? (
        <div className="space-y-4">
          <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
            <h2 className="font-display text-xl text-flaque-ink">Create Playlist</h2>
            <p className="mt-1 text-sm text-flaque-steel">
              Create a file-based playlist folder next to uploads with a `playlist.json` and symlinks.
            </p>

            <form
              className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                if (playlistCreateSubmitting) {
                  return;
                }

                setPlaylistCreateSubmitting(true);
                setPlaylistCreateStatus(null);

                handleCreatePlaylist({
                  name: playlistCreateName,
                  visibility: playlistCreateVisibility
                })
                  .then(() => {
                    setPlaylistCreateName("");
                    setPlaylistCreateStatus("Playlist created.");
                  })
                  .catch((error) => {
                    setPlaylistCreateStatus(error instanceof Error ? error.message : "Unable to create playlist");
                  })
                  .finally(() => {
                    setPlaylistCreateSubmitting(false);
                  });
              }}
            >
              <input
                className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                placeholder="Playlist name"
                value={playlistCreateName}
                onChange={(event) => setPlaylistCreateName(event.target.value)}
              />
              <select
                className="rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                value={playlistCreateVisibility}
                onChange={(event) => setPlaylistCreateVisibility(event.target.value as PlaylistVisibility)}
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
              <button
                className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={playlistCreateSubmitting}
              >
                {playlistCreateSubmitting ? "Creating..." : "Create"}
              </button>
            </form>

            {playlistCreateStatus ? (
              <p className="mt-2 text-sm text-flaque-steel">{playlistCreateStatus}</p>
            ) : null}

            <div className="mt-4">
              <h3 className="font-display text-lg text-flaque-ink">Playlists</h3>
              {availablePlaylists.length === 0 ? (
                <p className="mt-2 text-sm text-flaque-steel">No playlists yet.</p>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {availablePlaylists.map((playlist) => {
                    const playlistOwner = ownerNameById[playlist.authorId] ?? playlist.authorId;
                    return (
                      <button
                        key={playlist.id}
                        className="rounded-xl border border-flaque-clay/60 bg-flaque-cream/40 px-3 py-2 text-left transition hover:bg-flaque-cream"
                        type="button"
                        onClick={() => handlePlayPlaylist(playlist)}
                        title={`Play playlist ${playlist.name}`}
                      >
                        <p className="truncate text-sm font-medium text-flaque-ink">{playlist.name}</p>
                        <p className="truncate text-xs text-flaque-steel">
                          {playlist.trackIds.length} track{playlist.trackIds.length > 1 ? "s" : ""} - {playlist.visibility} - {playlistOwner}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
            <h2 className="font-display text-xl text-flaque-ink">Played Recently</h2>

            {recentTracks.length === 0 ? (
              <p className="mt-3 text-sm text-flaque-steel">No recently played tracks yet.</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {recentTracks.map((track) => {
                  const title = getTrackDisplayTitle(track);
                  const artist = getTrackDisplayArtist(track) ?? "Unknown artist";
                  const albumWithYear = getTrackDisplayAlbumWithYear(track);

                  return (
                    <button
                      key={track.id}
                      className="w-full justify-self-start rounded-xl border border-flaque-clay/60 bg-flaque-cream/50 px-2.5 py-2 text-left transition hover:bg-flaque-cream sm:max-w-[18.5rem]"
                      type="button"
                      onClick={() => handleReplayRecentTrack(track)}
                      title={title}
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          className="h-10 w-10 shrink-0 rounded-lg border border-flaque-clay/50 object-cover"
                          src={coverUrl(track.id, track.cover)}
                          alt={albumWithYear ? `Cover for ${albumWithYear}` : `Cover for ${title}`}
                          onError={(event) => {
                            event.currentTarget.src = defaultCoverImage;
                          }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-flaque-ink">{title}</p>
                          <p className="truncate text-xs text-flaque-steel">
                            {artist}
                            {albumWithYear ? ` - ${albumWithYear}` : ""}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

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
            onOpenUpload={() => setActiveView("upload")}
          />
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
        <div
          className={
            activeView === "player"
              ? "mt-4"
              : "fixed bottom-0 left-0 right-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2"
          }
        >
          <div className="mx-auto max-w-7xl">
            {playerStatusMessage ? (
              <p className="mb-2 rounded-xl border border-flaque-clay/60 bg-white/85 px-3 py-2 text-sm text-flaque-steel" role="status">
                {playerStatusMessage}
              </p>
            ) : null}
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
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
