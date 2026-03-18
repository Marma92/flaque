import { useEffect, useMemo, useState } from "react";

import {
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
  resetUserPassword,
  rebuildIndex,
  updateTrackMetadata,
  uploadTracks,
  type UploadTrackPreview,
  type UploadTracksResult
} from "./api";
import { AudioPlayer, type TranscodeMode } from "./components/AudioPlayer";
import { ConfigView } from "./components/ConfigView";
import { LibraryView } from "./components/LibraryView";
import { LoginPage } from "./components/LoginPage";
import { PlayerView } from "./components/PlayerView";
import { UploadView } from "./components/UploadView";
import type { LibraryResponse, Track, TrackMetadataPatch, User } from "./types";
import { getTrackDisplayTitle } from "./utils/tracks";

type ViewName = "library" | "upload" | "player" | "config";

const RECENT_TRACKS_STORAGE_KEY = "flaque_recent_tracks_v1";
const TRANSCODE_MODE_STORAGE_KEY = "flaque_transcode_mode_v1";
const MAX_RECENT_TRACKS = 24;

const EMPTY_LIBRARY: LibraryResponse = {
  generatedAt: "",
  totalTracks: 0,
  owners: [],
  artists: [],
  albums: [],
  tracks: []
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

function getAdjacentTrackInQueue(
  queue: Track[],
  currentTrackId: string,
  direction: "next" | "previous"
): Track | null {
  if (queue.length === 0) {
    return null;
  }

  const currentIndex = queue.findIndex((track) => track.id === currentTrackId);
  if (currentIndex < 0) {
    return null;
  }

  if (queue.length === 1) {
    return null;
  }

  const offset = direction === "next" ? 1 : -1;
  const targetIndex = (currentIndex + offset + queue.length) % queue.length;
  return queue[targetIndex] ?? null;
}

export default function App(): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [activeView, setActiveView] = useState<ViewName>("library");

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

  const [rebuilding, setRebuilding] = useState(false);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [recentTracks, setRecentTracks] = useState<Track[]>([]);

  const allTracksById = useMemo(() => {
    return new Map(allTracksLibrary.tracks.map((track) => [track.id, track]));
  }, [allTracksLibrary.tracks]);

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

  useEffect(() => {
    getCurrentUser()
      .then((nextUser) => {
        setUser(nextUser);
      })
      .finally(() => setSessionChecked(true));
  }, []);

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
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(TRANSCODE_MODE_STORAGE_KEY, transcodeMode);
  }, [transcodeMode]);

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
    if (!user || user.role !== "admin" || activeView !== "config") {
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
  }, [user, activeView]);

  useEffect(() => {
    if (!user || user.role === "admin") {
      return;
    }

    if (activeView === "config") {
      setActiveView("library");
    }
  }, [user, activeView]);

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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Index rebuild failed";
      setLibraryError(message);
      setAllTracksError(message);
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

    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
  }

  async function handleUpdateTrackMetadata(trackId: string, patch: TrackMetadataPatch): Promise<void> {
    await updateTrackMetadata(trackId, patch);
    await Promise.all([refreshCurrentLibrary(), refreshAllTracks()]);
  }

  async function handleNavigateTrack(direction: "next" | "previous"): Promise<void> {
    const currentTrack = selectedTrackRefreshed;
    if (!currentTrack) {
      return;
    }

    const nextTrackFromQueue = getAdjacentTrackInQueue(refreshedQueue, currentTrack.id, direction);
    if (nextTrackFromQueue && nextTrackFromQueue.id !== currentTrack.id) {
      setSelectedTrack(nextTrackFromQueue);
      return;
    }

    try {
      const adjacentTrack = await getAdjacentTrack({
        trackId: currentTrack.id,
        direction,
        wrap: true,
        owner: filters.owner,
        artist: filters.artist,
        album: filters.album,
        q: filters.q
      });

      if (!adjacentTrack || adjacentTrack.id === currentTrack.id) {
        return;
      }

      setSelectedTrack(adjacentTrack);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Unable to navigate tracks");
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
    if (source.length > 0) {
      setPlayQueue(source);
    }

    setSelectedTrack(track);
    setPlayRequestNonce((current) => current + 1);
  }

  function handleReplayRecentTrack(track: Track): void {
    const fullTrack = allTracksById.get(track.id) ?? track;
    requestTrackPlayback(fullTrack, allTracksLibrary.tracks.length > 0 ? allTracksLibrary.tracks : undefined);
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
        hasStickyPlayer ? "pb-72" : "pb-10"
      }`}
    >
      <header className="mb-4 rounded-3xl border border-flaque-clay/60 bg-white/80 px-5 py-4 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-flaque-steel">flaque</p>
            <h1 className="font-display text-2xl text-flaque-ink">File-based Hi-Fi Library</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl text-flaque-ink">Played Recently</h2>
              <p className="text-xs uppercase tracking-[0.2em] text-flaque-steel">local storage</p>
            </div>

            {recentTracks.length === 0 ? (
              <p className="mt-3 text-sm text-flaque-steel">No recently played tracks yet.</p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {recentTracks.map((track) => {
                  const title = getTrackDisplayTitle(track);

                  return (
                    <button
                      key={track.id}
                      className="rounded-xl border border-flaque-clay/60 bg-flaque-cream/50 px-3 py-2 text-left transition hover:bg-flaque-cream"
                      type="button"
                      onClick={() => handleReplayRecentTrack(track)}
                      title={title}
                    >
                      <p className="truncate text-sm font-medium text-flaque-ink">{title}</p>
                      <p className="truncate text-xs text-flaque-steel">
                        {track.tags.artist ?? "Unknown artist"}
                        {track.tags.album ? ` - ${track.tags.album}` : ""}
                      </p>
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

      {activeView === "player" ? <PlayerView track={selectedTrackRefreshed} /> : null}

      {activeView === "config" && user.role === "admin" ? (
        <ConfigView
          currentUser={user}
          tracks={allTracksLibrary.tracks}
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
        <div className={activeView === "player" ? "mt-4" : "fixed bottom-0 left-0 right-0 z-40 px-3 pb-3 pt-2"}>
          <div className="mx-auto max-w-7xl">
            <AudioPlayer
              track={selectedTrackRefreshed}
              expanded={activeView === "player"}
              onNext={() => handleNavigateTrack("next")}
              onPrevious={() => handleNavigateTrack("previous")}
              onTrackPlayed={handleTrackPlayed}
              transcodeMode={transcodeMode}
              onTranscodeModeChange={setTranscodeMode}
              playRequestNonce={playRequestNonce}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
