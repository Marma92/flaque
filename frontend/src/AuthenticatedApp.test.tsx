/* @vitest-environment happy-dom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Track, User } from "./types";

/**
 * AuthenticatedApp is the composition root: its job is to wire ~18 hooks into
 * the prop bundles AppShell consumes. Rendering the whole tree would test the
 * children instead, so AppShell is mocked to capture exactly what the root
 * assembles. That makes the wiring itself the unit under test, and lets a
 * refactor prove it kept the assembled shape intact.
 */

const capturedProps: { current: Record<string, any> | null } = { current: null };

vi.mock("./components/AppShell", () => ({
  AppShell: (props: Record<string, unknown>) => {
    capturedProps.current = props;
    return <div data-testid="app-shell" />;
  }
}));

const track = (id: string, title: string): Track =>
  ({
    id,
    owner: "user-1",
    path: `music/${id}.flac`,
    duration: 100,
    mimeType: "audio/flac",
    codec: "flac",
    tags: { title, artist: "Artist A", album: "Album A" }
  }) as unknown as Track;

const trackA = track("t1", "Track A");
const trackB = track("t2", "Track B");

vi.mock("./api", () => ({
  logout: vi.fn().mockResolvedValue(undefined),
  myProfilePhotoUrl: ({ version }: { version: number }) => `/photo?v=${version}`
}));

vi.mock("./hooks/useLibraryData", () => ({
  useLibraryData: () => ({
    filters: {},
    setFilters: vi.fn(),
    library: {
      tracks: [trackA, trackB],
      artists: [{ name: "Artist A", normalizedName: "artist a" }],
      albums: [{ name: "Album A", artist: "Artist A" }],
      owners: ["user-1"],
      ownerNamesById: { "user-1": "alice" }
    },
    allTracksLibrary: { tracks: [trackA, trackB] },
    availablePlaylists: [
      { id: "p1", name: "Mine", authorId: "user-1", collaborators: [] },
      { id: "p2", name: "Someone else", authorId: "user-9", collaborators: [] }
    ],
    libraryArtists: [{ name: "Artist A", normalizedName: "artist a" }],
    selectedArtist: null,
    artistAlbums: [],
    selectedArtistAlbum: null,
    libraryAlbums: [{ name: "Album A", artist: "Artist A" }],
    selectedArtistAlbumTracks: [],
    selectedArtistAlbumTracksError: null,
    selectedAlbum: null,
    selectedAlbumTracks: [],
    selectedAlbumTracksError: null,
    loadingLibrary: false,
    loadingAllTracks: false,
    loadingLibraryArtists: false,
    loadingArtistAlbums: false,
    loadingSelectedArtistAlbumTracks: false,
    loadingLibraryAlbums: false,
    loadingSelectedAlbumTracks: false,
    libraryError: null,
    setLibraryError: vi.fn(),
    allTracksError: null,
    setAllTracksError: vi.fn(),
    libraryMetadataError: null,
    refreshCurrentLibrary: vi.fn(),
    refreshAllTracks: vi.fn(),
    selectArtist: vi.fn(),
    clearSelectedArtist: vi.fn(),
    selectArtistAlbum: vi.fn(),
    clearSelectedArtistAlbum: vi.fn(),
    selectAlbum: vi.fn(),
    clearSelectedAlbum: vi.fn()
  })
}));

vi.mock("./hooks/useRecentlyUploaded", () => ({
  useRecentlyUploaded: () => ({
    items: [],
    loading: false,
    period: "7d",
    setPeriod: vi.fn(),
    refresh: vi.fn()
  })
}));

vi.mock("./hooks/useInfiniteLibrary", () => ({
  useInfiniteLibrary: () => ({
    tracks: [trackA],
    loading: false,
    loadingMore: false,
    hasMore: false,
    total: 1,
    sentinelRef: { current: null },
    refresh: vi.fn()
  })
}));

vi.mock("./hooks/useAutoPlaylists", () => ({
  useAutoPlaylists: () => ({ autoPlaylists: [], loading: false, refresh: vi.fn() })
}));

vi.mock("./hooks/useForYouPlaylists", () => ({
  useForYouPlaylists: () => ({
    forYouPlaylists: [],
    loading: false,
    dismiss: vi.fn(),
    regenerate: vi.fn()
  })
}));

vi.mock("./hooks/usePersonalPlaylists", () => ({
  usePersonalPlaylists: () => ({
    personalPlaylists: [],
    loading: false,
    regenerate: vi.fn()
  })
}));

vi.mock("./hooks/usePlaybackState", () => ({
  usePlaybackState: () => ({
    selectedTrackRefreshed: trackA,
    refreshedQueue: [trackA, trackB],
    playRequestNonce: 0,
    playRequestOffsetSec: 0,
    transcodeMode: "off",
    setTranscodeMode: vi.fn(),
    repeatMode: "off",
    setRepeatMode: vi.fn(),
    shuffleEnabled: false,
    setShuffleEnabled: vi.fn(),
    recentTracks: [],
    requestTrackPlayback: vi.fn(),
    replayRecentTrack: vi.fn(),
    recordTrackPlayed: vi.fn(),
    recordTrackSkipped: vi.fn(),
    removeTrackFromPlayback: vi.fn(),
    setSelectedTrack: vi.fn(),
    resetAfterLogout: vi.fn()
  })
}));

vi.mock("./hooks/useResumeState", () => ({
  useResumeState: () => ({ resumeState: null, dismiss: vi.fn() })
}));

vi.mock("./hooks/useRadioStation", () => ({
  useRadioStation: () => ({
    loading: false,
    stationId: null,
    currentTrack: null,
    nextTrack: null,
    isRadioPlaybackActive: false,
    startRadioPlayback: vi.fn(),
    stopRadioPlayback: vi.fn()
  })
}));

vi.mock("./hooks/useAdminUsers", () => ({
  useAdminUsers: () => ({
    adminUsers: [{ id: "user-2", username: "bob" }],
    clearAdminState: vi.fn()
  })
}));

vi.mock("./hooks/useLibraryCommands", () => ({
  useLibraryCommands: () => ({
    handleUpload: vi.fn(),
    handleInspectUploadFile: vi.fn(),
    handleRebuildIndex: vi.fn(),
    handleDeleteTrack: vi.fn(),
    handleUpdateTrackMetadata: vi.fn(),
    handleReEnrichTrack: vi.fn(),
    handleBulkDeleteTracks: vi.fn(),
    handleBulkUpdateTrackMetadata: vi.fn(),
    handleCreatePlaylist: vi.fn(),
    handleAddTrackToPlaylist: vi.fn(),
    handlePatchPlaylist: vi.fn(),
    handleDeletePlaylist: vi.fn(),
    handleHeartPlaylist: vi.fn(),
    handleReportPlaylistListen: vi.fn()
  })
}));

vi.mock("./hooks/usePlaybackCommands", () => ({
  usePlaybackCommands: () => ({
    requestTrackPlaybackWithStatus: vi.fn(),
    handleReplayRecentTrack: vi.fn(),
    handlePlayPlaylist: vi.fn(),
    handlePlayAlbum: vi.fn(),
    handleNavigateTrack: vi.fn()
  })
}));

vi.mock("./hooks/useAppNotice", () => ({
  useAppNotice: () => ({ appNotice: null, setAppNotice: vi.fn() })
}));

vi.mock("./hooks/useDocumentTitle", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("./hooks/useLanguageSync", () => ({ useLanguageSync: vi.fn() }));

const user: User = {
  id: "user-1",
  username: "alice",
  email: "alice@test.local",
  role: "admin",
  language: "en"
};

async function renderRoot() {
  const { AuthenticatedApp } = await import("./AuthenticatedApp");
  return render(
    <AuthenticatedApp
      user={user}
      setUser={vi.fn()}
      activeView="library"
      setActiveView={vi.fn()}
      activeLibrarySection="home"
      setActiveLibrarySection={vi.fn()}
      activeConfigSection="index"
      setActiveConfigSection={vi.fn()}
      playlistDetailId={null}
      setPlaylistDetailId={vi.fn()}
      notifyAuthStateChanged={vi.fn()}
    />
  );
}

beforeEach(() => {
  capturedProps.current = null;
});

afterEach(() => {
  cleanup();
});

describe("AuthenticatedApp composition", () => {
  it("renders the shell without throwing", async () => {
    const { getByTestId } = await renderRoot();
    expect(getByTestId("app-shell")).toBeTruthy();
    expect(capturedProps.current).not.toBeNull();
  });

  it("passes through the top-level shell props", async () => {
    await renderRoot();
    const props = capturedProps.current!;

    expect(props.activeView).toBe("library");
    expect(props.user).toEqual(user);
    expect(props.avatarUrl).toBe("/photo?v=0");
    expect(props.loadingLibrary).toBe(false);
    expect(props.libraryError).toBeNull();
    expect(typeof props.onViewChange).toBe("function");
    expect(typeof props.onLogout).toBe("function");
    expect(typeof props.onPlayerCollapse).toBe("function");
  });

  it("assembles every library workspace sub-bundle", async () => {
    await renderRoot();
    const workspace = capturedProps.current!.libraryWorkspaceProps;

    expect(Object.keys(workspace).sort()).toEqual(
      ["activeLibrarySection", "albumsProps", "artistsProps", "homeProps", "musicProps", "playlistsProps"].sort()
    );
    expect(workspace.activeLibrarySection).toBe("home");
  });

  it("derives manageablePlaylists from ownership and collaborators", async () => {
    await renderRoot();
    const { playlistsProps } = capturedProps.current!.libraryWorkspaceProps;

    // p1 is authored by the current user, p2 belongs to someone else.
    expect(playlistsProps.manageablePlaylists.map((p: { id: string }) => p.id)).toEqual(["p1"]);
    expect(playlistsProps.availablePlaylists).toHaveLength(2);
  });

  it("merges owner names from the library, the current user and admin users", async () => {
    await renderRoot();
    const { ownerNameById } = capturedProps.current!.libraryWorkspaceProps.musicProps;

    expect(ownerNameById).toMatchObject({
      "user-1": "alice",
      "user-2": "bob"
    });
  });

  it("wires the audio player bundle to the current track and queue", async () => {
    await renderRoot();
    const audio = capturedProps.current!.audioPlayerProps;

    expect(audio.track).toEqual(trackA);
    expect(audio.queueTracks).toEqual([trackA, trackB]);
    expect(audio.currentQueueTrackId).toBe("t1");
    expect(audio.seekLocked).toBe(false);
    expect(typeof audio.onOpenTrackArtist).toBe("function");
    expect(typeof audio.onOpenTrackAlbum).toBe("function");
  });

  it("assembles the upload and config bundles", async () => {
    await renderRoot();
    const props = capturedProps.current!;

    expect(typeof props.uploadViewProps.onUpload).toBe("function");
    expect(typeof props.uploadViewProps.onInspectFile).toBe("function");
    expect(props.configViewProps.activeSection).toBe("index");
    expect(props.configViewProps.currentUser).toEqual(user);
    expect(props.configViewProps.tracks).toEqual([trackA, trackB]);
  });
});
