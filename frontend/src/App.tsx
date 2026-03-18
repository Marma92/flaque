import { useEffect, useMemo, useState } from "react";

import {
  createUserAccount,
  deleteUserAccount,
  getAdjacentTrack,
  getCurrentUser,
  getLibrary,
  getUsers,
  login,
  logout,
  patchUserAccount,
  resetUserPassword,
  rebuildIndex,
  uploadTracks,
  type UploadTracksResult
} from "./api";
import { AdminUsersView } from "./components/AdminUsersView";
import { AudioPlayer } from "./components/AudioPlayer";
import { LibraryView } from "./components/LibraryView";
import { LoginPage } from "./components/LoginPage";
import { PlayerView } from "./components/PlayerView";
import type { LibraryResponse, Track, User } from "./types";

type ViewName = "library" | "player" | "admin";

const EMPTY_LIBRARY: LibraryResponse = {
  generatedAt: "",
  totalTracks: 0,
  owners: [],
  artists: [],
  albums: [],
  tracks: []
};

export default function App(): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [activeView, setActiveView] = useState<ViewName>("library");
  const [library, setLibrary] = useState<LibraryResponse>(EMPTY_LIBRARY);
  const [filters, setFilters] = useState<{
    owner?: string;
    artist?: string;
    album?: string;
    q?: string;
  }>({});
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then((nextUser) => {
        setUser(nextUser);
      })
      .finally(() => setSessionChecked(true));
  }, []);

  useEffect(() => {
    if (!user) {
      setLibrary(EMPTY_LIBRARY);
      return;
    }

    setLoadingLibrary(true);
    setLibraryError(null);

    getLibrary(filters)
      .then((payload) => {
        setLibrary(payload);
      })
      .catch((error) => {
        setLibraryError(error instanceof Error ? error.message : "Failed to load library");
      })
      .finally(() => {
        setLoadingLibrary(false);
      });
  }, [user, filters]);

  useEffect(() => {
    if (!user || user.role !== "admin" || activeView !== "admin") {
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

  const selectedTrackRefreshed = useMemo(() => {
    if (!selectedTrack) {
      return null;
    }
    return library.tracks.find((track) => track.id === selectedTrack.id) ?? selectedTrack;
  }, [library.tracks, selectedTrack]);

  async function handleLogin(username: string, password: string): Promise<void> {
    const authenticatedUser = await login(username, password);
    setUser(authenticatedUser);
    setActiveView("library");
  }

  async function handleLogout(): Promise<void> {
    await logout();
    setUser(null);
    setSelectedTrack(null);
    setFilters({});
    setAdminUsers([]);
    setAdminError(null);
  }

  async function handleUpload(input: {
    files: File[];
    artist?: string;
    album?: string;
  }): Promise<UploadTracksResult> {
    const result = await uploadTracks(input);
    const updatedLibrary = await getLibrary(filters);
    setLibrary(updatedLibrary);
    return result;
  }

  async function handleRebuildIndex(): Promise<void> {
    setRebuilding(true);
    setLibraryError(null);
    try {
      await rebuildIndex();
      const updatedLibrary = await getLibrary(filters);
      setLibrary(updatedLibrary);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Index rebuild failed");
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

  async function handleNavigateTrack(direction: "next" | "previous"): Promise<void> {
    const currentTrack = selectedTrackRefreshed;
    if (!currentTrack) {
      return;
    }

    try {
      const adjacentTrack = await getAdjacentTrack({
        trackId: currentTrack.id,
        direction,
        wrap: true
      });

      if (!adjacentTrack || adjacentTrack.id === currentTrack.id) {
        return;
      }

      setSelectedTrack(adjacentTrack);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : "Unable to navigate tracks");
    }
  }

  if (!sessionChecked) {
    return <main className="p-8 text-flaque-ink">Loading session...</main>;
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-10 pt-6 md:px-6">
      <header className="mb-4 rounded-3xl border border-flaque-clay/60 bg-white/80 px-5 py-4 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-flaque-steel">flaque</p>
            <h1 className="font-display text-2xl text-flaque-ink">File-based Hi-Fi Library</h1>
          </div>

          <div className="flex items-center gap-2">
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
                  activeView === "admin"
                    ? "bg-flaque-ink text-flaque-cream"
                    : "border border-flaque-clay bg-white text-flaque-ink"
                }`}
                type="button"
                onClick={() => setActiveView("admin")}
              >
                Admin
              </button>
            ) : null}
            <button
              className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream"
              type="button"
              onClick={handleLogout}
            >
              Logout ({user.username})
            </button>
            {user.role === "admin" ? (
              <button
                className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={handleRebuildIndex}
                disabled={rebuilding}
              >
                {rebuilding ? "Rebuilding index..." : "Rebuild index"}
              </button>
            ) : null}
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
              setSelectedTrack(track);
              setActiveView("player");
            }}
            onUpload={handleUpload}
          />
          <AudioPlayer
            track={selectedTrackRefreshed}
            onNext={() => handleNavigateTrack("next")}
            onPrevious={() => handleNavigateTrack("previous")}
          />
        </div>
      ) : activeView === "player" ? (
        <PlayerView
          track={selectedTrackRefreshed}
          onNext={() => handleNavigateTrack("next")}
          onPrevious={() => handleNavigateTrack("previous")}
        />
      ) : (
        <AdminUsersView
          currentUser={user}
          users={adminUsers}
          loading={loadingAdminUsers}
          error={adminError}
          onRefresh={refreshAdminUsers}
          onCreateUser={handleCreateUser}
          onDeleteUser={handleDeleteUser}
          onPatchUser={handlePatchUser}
          onResetPassword={handleResetUserPassword}
        />
      )}
    </main>
  );
}
