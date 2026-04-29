/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AutoPlaylistSummary, ForYouPlaylistSummary, Playlist } from "../types";
import { LibraryPlaylistSection } from "./LibraryPlaylistSection";

function createPlaylist(input: {
  id: string;
  name: string;
  authorId: string;
  visibility?: "private" | "public";
  trackIds?: string[];
  description?: string;
  hearts?: string[];
  heartCount?: number;
  listenCount?: number;
  collaborators?: string[];
}): Playlist {
  return {
    id: input.id,
    name: input.name,
    authorId: input.authorId,
    visibility: input.visibility ?? "private",
    trackIds: input.trackIds ?? [],
    description: input.description ?? "",
    cover: null,
    hearts: input.hearts ?? [],
    heartCount: input.heartCount ?? 0,
    listenCount: input.listenCount ?? 0,
    collaborators: input.collaborators ?? []
  };
}

const defaultProps = {
  manageablePlaylists: [] as Playlist[],
  allTracksById: new Map(),
  user: { id: "user-1", username: "Alice", email: "alice@test.local", role: "user" as const },
  onPatchPlaylist: vi.fn().mockResolvedValue(undefined),
  onDeletePlaylist: vi.fn().mockResolvedValue(undefined),
  onNavigateToPlaylist: vi.fn(),
  onReportPlaylistListen: vi.fn().mockResolvedValue(undefined),
  autoPlaylists: [] as AutoPlaylistSummary[],
  loadingAutoPlaylists: false,
  forYouPlaylists: [] as ForYouPlaylistSummary[],
  loadingForYouPlaylists: false,
  onDismissForYouPlaylist: vi.fn().mockResolvedValue(undefined),
  onHeartPlaylist: vi.fn().mockResolvedValue(undefined)
};

describe("LibraryPlaylistSection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ── Basic CRUD ───────────────────────────────────────────────

  it("shows empty state when no playlists exist", () => {
    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
      />
    );

    expect(screen.getByText("No playlists yet.")).toBeTruthy();
  });

  it("submits create playlist and clears the form", async () => {
    const onCreatePlaylist = vi.fn().mockResolvedValue(undefined);

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={onCreatePlaylist}
        onPlayPlaylist={vi.fn()}
      />
    );

    const nameInput = screen.getByPlaceholderText("New playlist name") as HTMLInputElement;
    const visibilityInput = screen.getByRole("combobox") as HTMLSelectElement;

    fireEvent.change(nameInput, { target: { value: "Road Trip" } });
    fireEvent.change(visibilityInput, { target: { value: "public" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onCreatePlaylist).toHaveBeenCalledWith({
        name: "Road Trip",
        visibility: "public"
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Playlist created.")).toBeTruthy();
    });

    expect(nameInput.value).toBe("");
  });

  it("shows server error when playlist creation fails", async () => {
    const onCreatePlaylist = vi.fn().mockRejectedValue(new Error("Name already exists"));

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={onCreatePlaylist}
        onPlayPlaylist={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("New playlist name"), { target: { value: "Road Trip" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getByText("Name already exists")).toBeTruthy();
    });
  });

  it("plays a playlist when the play button is clicked", () => {
    const playlist = createPlaylist({
      id: "playlist-1",
      name: "Night Drive",
      authorId: "user-1",
      trackIds: ["track-1", "track-2"]
    });
    const onPlayPlaylist = vi.fn();

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[playlist]}
        ownerNameById={{ "user-1": "Alice" }}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={onPlayPlaylist}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Play Night Drive" }));

    expect(onPlayPlaylist).toHaveBeenCalledWith(playlist);
  });

  // ── Description field in create form ─────────────────────────

  it("shows description field when name is filled", () => {
    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
      />
    );

    // No description field initially
    expect(screen.queryByPlaceholderText("Description (optional)")).toBeNull();

    // Type a name — description field should appear
    fireEvent.change(screen.getByPlaceholderText("New playlist name"), { target: { value: "Test" } });
    expect(screen.getByPlaceholderText("Description (optional)")).toBeTruthy();
  });

  it("submits description along with create", async () => {
    const onCreatePlaylist = vi.fn().mockResolvedValue(undefined);

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={onCreatePlaylist}
        onPlayPlaylist={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("New playlist name"), { target: { value: "Described" } });
    fireEvent.change(screen.getByPlaceholderText("Description (optional)"), { target: { value: "My description" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onCreatePlaylist).toHaveBeenCalledWith({
        name: "Described",
        visibility: "private",
        description: "My description"
      });
    });
  });

  it("omits description when empty", async () => {
    const onCreatePlaylist = vi.fn().mockResolvedValue(undefined);

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={onCreatePlaylist}
        onPlayPlaylist={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("New playlist name"), { target: { value: "NoDesc" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onCreatePlaylist).toHaveBeenCalledWith({
        name: "NoDesc",
        visibility: "private"
      });
    });
  });

  // ── Popular Playlists section ────────────────────────────────

  it("renders Popular Playlists section for public playlists from other users", () => {
    const publicPlaylist = createPlaylist({
      id: "playlist-pub",
      name: "Top Hits",
      authorId: "user-2",
      visibility: "public",
      heartCount: 5,
      listenCount: 20
    });

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[publicPlaylist]}
        ownerNameById={{ "user-2": "Bob" }}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
      />
    );

    expect(screen.getByText("Popular Playlists")).toBeTruthy();
    expect(screen.getByText("Top Hits")).toBeTruthy();
  });

  it("shows heart button on popular playlist cards", () => {
    const publicPlaylist = createPlaylist({
      id: "playlist-pub",
      name: "Hearted Mix",
      authorId: "user-2",
      visibility: "public",
      heartCount: 3
    });

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[publicPlaylist]}
        ownerNameById={{ "user-2": "Bob" }}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Heart playlist")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("calls onHeartPlaylist when heart is clicked", () => {
    const onHeartPlaylist = vi.fn().mockResolvedValue(undefined);
    const publicPlaylist = createPlaylist({
      id: "playlist-pub",
      name: "Heart Me",
      authorId: "user-2",
      visibility: "public"
    });

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[publicPlaylist]}
        ownerNameById={{ "user-2": "Bob" }}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
        onHeartPlaylist={onHeartPlaylist}
      />
    );

    fireEvent.click(screen.getByLabelText("Heart playlist"));
    expect(onHeartPlaylist).toHaveBeenCalledWith("playlist-pub");
  });

  it("does not show Popular Playlists when no public playlists from others exist", () => {
    const myPlaylist = createPlaylist({
      id: "playlist-mine",
      name: "Mine",
      authorId: "user-1",
      visibility: "public"
    });

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[myPlaylist]}
        ownerNameById={{ "user-1": "Alice" }}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
      />
    );

    expect(screen.queryByText("Popular Playlists")).toBeNull();
  });

  // ── Playlist card info ───────────────────────────────────────

  it("shows description on playlist card when set", () => {
    const playlist = createPlaylist({
      id: "playlist-desc",
      name: "With Desc",
      authorId: "user-1",
      description: "A cool playlist"
    });

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[playlist]}
        ownerNameById={{ "user-1": "Alice" }}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
      />
    );

    expect(screen.getByText("A cool playlist")).toBeTruthy();
  });

  it("navigates to playlist detail on card click", () => {
    const onNavigateToPlaylist = vi.fn();
    const playlist = createPlaylist({
      id: "playlist-nav",
      name: "Navigable",
      authorId: "user-1"
    });

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[playlist]}
        ownerNameById={{ "user-1": "Alice" }}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
        onNavigateToPlaylist={onNavigateToPlaylist}
      />
    );

    fireEvent.click(screen.getByText("Navigable"));
    expect(onNavigateToPlaylist).toHaveBeenCalledWith("playlist-nav");
  });

  // ── Automatic Playlists section ──────────────────────────────

  it("renders Automatic Playlists section with cards", () => {
    const autoPlaylists: AutoPlaylistSummary[] = [
      {
        id: "auto:rock-1970",
        name: "70s Rock",
        genre: "Rock",
        decade: 1970,
        trackCount: 25,
        generatedAt: "2026-04-01T00:00:00Z"
      }
    ];

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
        autoPlaylists={autoPlaylists}
      />
    );

    expect(screen.getByText("Automatic Playlists")).toBeTruthy();
    expect(screen.getByText("70s Rock")).toBeTruthy();
    expect(screen.getByText("Rock")).toBeTruthy();
    expect(screen.getByText(/25 tracks/)).toBeTruthy();
  });

  it("shows loading state for auto playlists", () => {
    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
        loadingAutoPlaylists={true}
      />
    );

    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  it("shows empty message when no auto playlists", () => {
    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
        autoPlaylists={[]}
      />
    );

    expect(screen.getByText("Automatic playlists will appear here once generated.")).toBeTruthy();
  });

  it("navigates to auto playlist on click", () => {
    const onNavigateToPlaylist = vi.fn();
    const autoPlaylists: AutoPlaylistSummary[] = [
      {
        id: "auto:jazz-1960",
        name: "60s Jazz",
        genre: "Jazz",
        decade: 1960,
        trackCount: 15,
        generatedAt: "2026-04-01T00:00:00Z"
      }
    ];

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
        autoPlaylists={autoPlaylists}
        onNavigateToPlaylist={onNavigateToPlaylist}
      />
    );

    fireEvent.click(screen.getByText("60s Jazz"));
    expect(onNavigateToPlaylist).toHaveBeenCalledWith("auto:jazz-1960");
  });

  // ── Made for you section ─────────────────────────────────────

  it("renders Made for you section", () => {
    const forYouPlaylists: ForYouPlaylistSummary[] = [
      {
        id: "for-you:pink-floyd",
        name: "Because you listen to Pink Floyd",
        seedArtist: "Pink Floyd",
        trackCount: 20,
        generatedAt: "2026-04-01T00:00:00Z"
      }
    ];

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
        forYouPlaylists={forYouPlaylists}
      />
    );

    expect(screen.getByText("Made for you")).toBeTruthy();
    expect(screen.getByText("Because you listen to Pink Floyd")).toBeTruthy();
    expect(screen.getByText("Pink Floyd")).toBeTruthy();
  });

  it("shows Made for you section with info message when empty", () => {
    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
        forYouPlaylists={[]}
      />
    );

    expect(screen.getByText("Made for you")).toBeTruthy();
    expect(screen.getByText(/Listen to more music/)).toBeTruthy();
  });

  it("calls dismiss on for-you playlist", () => {
    const onDismissForYouPlaylist = vi.fn().mockResolvedValue(undefined);
    const forYouPlaylists: ForYouPlaylistSummary[] = [
      {
        id: "for-you:artist",
        name: "Because you listen to Artist",
        seedArtist: "Artist",
        trackCount: 10,
        generatedAt: "2026-04-01T00:00:00Z"
      }
    ];

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[]}
        ownerNameById={{}}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
        forYouPlaylists={forYouPlaylists}
        onDismissForYouPlaylist={onDismissForYouPlaylist}
      />
    );

    fireEvent.click(screen.getByLabelText("Hide Because you listen to Artist"));
    expect(onDismissForYouPlaylist).toHaveBeenCalledWith("for-you:artist");
  });

  // ── Listen count badges ──────────────────────────────────────

  it("shows listen count badge on popular playlist cards", () => {
    const publicPlaylist = createPlaylist({
      id: "playlist-listened",
      name: "Listened Mix",
      authorId: "user-2",
      visibility: "public",
      listenCount: 42
    });

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[publicPlaylist]}
        ownerNameById={{ "user-2": "Bob" }}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
      />
    );

    expect(screen.getByText("42")).toBeTruthy();
  });

  // ── Reports listen on play ───────────────────────────────────

  it("reports listen when playing a playlist", () => {
    const onReportPlaylistListen = vi.fn().mockResolvedValue(undefined);
    const playlist = createPlaylist({
      id: "playlist-report",
      name: "Report Me",
      authorId: "user-1",
      trackIds: ["t1"]
    });

    render(
      <LibraryPlaylistSection
        {...defaultProps}
        availablePlaylists={[playlist]}
        ownerNameById={{ "user-1": "Alice" }}
        onCreatePlaylist={vi.fn().mockResolvedValue(undefined)}
        onPlayPlaylist={vi.fn()}
        onReportPlaylistListen={onReportPlaylistListen}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Play Report Me" }));
    expect(onReportPlaylistListen).toHaveBeenCalledWith("playlist-report");
  });
});
