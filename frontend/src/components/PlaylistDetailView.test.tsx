/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Playlist, Track, User } from "../types";

const { getUsersMock } = vi.hoisted(() => ({
  getUsersMock: vi.fn<() => Promise<User[]>>().mockResolvedValue([])
}));

vi.mock("../api", () => ({
  coverUrl: (id: string) => `/api/covers/${id}`,
  playlistCoverUrl: (id: string) => `/api/playlists/${id}/cover`,
  getUsers: getUsersMock,
  uploadPlaylistCover: vi.fn().mockResolvedValue(undefined),
  deletePlaylistCover: vi.fn().mockResolvedValue(undefined)
}));

import { PlaylistDetailView } from "./PlaylistDetailView";

function makeTrack(id: string, title?: string, artist?: string): Track {
  return {
    id,
    owner: "user-1",
    path: `/uploads/${id}.mp3`,
    duration: 200,
    mimeType: "audio/mpeg",
    codec: "mp3",
    tags: {
      title: title ?? id,
      artist: artist ?? "Test Artist"
    }
  };
}

function makePlaylist(overrides: Partial<Playlist> = {}): Playlist {
  return {
    id: "user-1:my-playlist",
    name: "My Playlist",
    authorId: "user-1",
    visibility: "public",
    trackIds: ["t1", "t2"],
    description: "A test playlist",
    cover: null,
    hearts: [],
    heartCount: 0,
    listenCount: 5,
    collaborators: [],
    ...overrides
  };
}

const defaultUser: User = { id: "user-1", username: "alice", email: "alice@test.local", role: "user" };
const otherUser: User = { id: "user-2", username: "bob", email: "bob@test.local", role: "user" };

function createTracksMap(tracks: Track[]): Map<string, Track> {
  return new Map(tracks.map((t) => [t.id, t]));
}

const defaultTracks = [makeTrack("t1", "Song One", "Artist A"), makeTrack("t2", "Song Two", "Artist B")];
const defaultTracksById = createTracksMap(defaultTracks);

const defaultProps = {
  playlistId: "user-1:my-playlist",
  availablePlaylists: [makePlaylist()],
  manageablePlaylists: [makePlaylist()],
  allTracksById: defaultTracksById,
  ownerNameById: { "user-1": "alice", "user-2": "bob" } as Record<string, string>,
  user: defaultUser,
  onBack: vi.fn(),
  onPlay: vi.fn(),
  onPatch: vi.fn().mockResolvedValue(makePlaylist()),
  onNavigate: vi.fn(),
  onDelete: vi.fn().mockResolvedValue(undefined),
  onHeart: vi.fn().mockResolvedValue({ hearted: true, heartCount: 1 }),
  onReportListen: vi.fn().mockResolvedValue(undefined)
};

describe("PlaylistDetailView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders playlist info, tracks, and stats", () => {
    render(<PlaylistDetailView {...defaultProps} />);

    expect(screen.getByText("My Playlist")).toBeTruthy();
    expect(screen.getByText("A test playlist")).toBeTruthy();
    expect(screen.getByText("by alice")).toBeTruthy();
    expect(screen.getByText(/2 tracks/)).toBeTruthy();
    expect(screen.getByText("Song One")).toBeTruthy();
    expect(screen.getByText("Song Two")).toBeTruthy();
  });

  it("shows not found when playlist doesn't exist", () => {
    render(
      <PlaylistDetailView
        {...defaultProps}
        playlistId="nonexistent:id"
      />
    );

    expect(screen.getByText("Playlist not found.")).toBeTruthy();
  });

  it("shows back button and navigates on click", () => {
    const onBack = vi.fn();
    render(<PlaylistDetailView {...defaultProps} onBack={onBack} />);

    fireEvent.click(screen.getByText("Back to playlists"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("plays all tracks on Play all click", () => {
    const onPlay = vi.fn();
    const onReportListen = vi.fn().mockResolvedValue(undefined);
    render(<PlaylistDetailView {...defaultProps} onPlay={onPlay} onReportListen={onReportListen} />);

    fireEvent.click(screen.getByText("Play all"));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onReportListen).toHaveBeenCalledWith("user-1:my-playlist");
  });

  it("shuffles tracks on Shuffle click", () => {
    const onPlay = vi.fn();
    render(<PlaylistDetailView {...defaultProps} onPlay={onPlay} />);

    fireEvent.click(screen.getByText("Shuffle"));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  // ── Heart button ─────────────────────────────────────────────

  it("shows heart button for public playlist from other user", () => {
    const playlist = makePlaylist({ id: "user-2:other-playlist", authorId: "user-2", visibility: "public" });
    render(
      <PlaylistDetailView
        {...defaultProps}
        playlistId="user-2:other-playlist"
        availablePlaylists={[playlist]}
        manageablePlaylists={[]}
        user={defaultUser}
      />
    );

    expect(screen.getByLabelText("Heart playlist")).toBeTruthy();
  });

  it("does not show heart button for own playlist", () => {
    render(<PlaylistDetailView {...defaultProps} />);

    expect(screen.queryByLabelText("Heart playlist")).toBeNull();
    expect(screen.queryByLabelText("Remove heart")).toBeNull();
  });

  it("toggles heart on click", async () => {
    const onHeart = vi.fn().mockResolvedValue({ hearted: true, heartCount: 1 });
    const playlist = makePlaylist({ id: "user-2:heartable", authorId: "user-2", visibility: "public" });
    render(
      <PlaylistDetailView
        {...defaultProps}
        playlistId="user-2:heartable"
        availablePlaylists={[playlist]}
        manageablePlaylists={[]}
        user={defaultUser}
        onHeart={onHeart}
      />
    );

    fireEvent.click(screen.getByLabelText("Heart playlist"));

    await waitFor(() => {
      expect(onHeart).toHaveBeenCalledWith("user-2:heartable");
    });
  });

  it("shows filled heart when already hearted", () => {
    const playlist = makePlaylist({
      id: "user-2:hearted",
      authorId: "user-2",
      visibility: "public",
      hearts: ["user-1"],
      heartCount: 1
    });
    render(
      <PlaylistDetailView
        {...defaultProps}
        playlistId="user-2:hearted"
        availablePlaylists={[playlist]}
        manageablePlaylists={[]}
        user={defaultUser}
      />
    );

    expect(screen.getByLabelText("Remove heart")).toBeTruthy();
  });

  // ── Visibility badge ─────────────────────────────────────────

  it("shows visibility badge", () => {
    render(<PlaylistDetailView {...defaultProps} />);
    expect(screen.getByText("public")).toBeTruthy();
  });

  it("shows private badge for private playlist", () => {
    const playlist = makePlaylist({ visibility: "private" });
    render(
      <PlaylistDetailView
        {...defaultProps}
        availablePlaylists={[playlist]}
        manageablePlaylists={[playlist]}
      />
    );
    expect(screen.getByText("private")).toBeTruthy();
  });

  // ── Listen count ─────────────────────────────────────────────

  it("shows listen count when > 0", () => {
    const playlist = makePlaylist({ listenCount: 42 });
    render(
      <PlaylistDetailView
        {...defaultProps}
        availablePlaylists={[playlist]}
        manageablePlaylists={[playlist]}
      />
    );
    expect(screen.getByText("42")).toBeTruthy();
  });

  // ── Collaborators ────────────────────────────────────────────

  it("displays collaborators", () => {
    const playlist = makePlaylist({ collaborators: ["user-2"] });
    render(
      <PlaylistDetailView
        {...defaultProps}
        availablePlaylists={[playlist]}
        manageablePlaylists={[playlist]}
      />
    );

    expect(screen.getByText("Collaborators:")).toBeTruthy();
    expect(screen.getByText("bob")).toBeTruthy();
  });

  // ── Edit button visibility ───────────────────────────────────

  it("shows Edit button for manageable playlist", () => {
    render(<PlaylistDetailView {...defaultProps} />);
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("shows Edit button for collaborator", () => {
    const playlist = makePlaylist({ id: "user-2:collab", authorId: "user-2", collaborators: ["user-1"] });
    render(
      <PlaylistDetailView
        {...defaultProps}
        playlistId="user-2:collab"
        availablePlaylists={[playlist]}
        manageablePlaylists={[]}
      />
    );
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("hides Edit and Delete for non-owner non-collaborator", () => {
    const playlist = makePlaylist({ id: "user-2:foreign", authorId: "user-2" });
    render(
      <PlaylistDetailView
        {...defaultProps}
        playlistId="user-2:foreign"
        availablePlaylists={[playlist]}
        manageablePlaylists={[]}
      />
    );
    expect(screen.queryByText("Edit")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
  });

  // ── Delete ───────────────────────────────────────────────────

  it("deletes playlist and navigates back", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onBack = vi.fn();
    render(<PlaylistDetailView {...defaultProps} onDelete={onDelete} onBack={onBack} />);

    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("user-1:my-playlist");
      expect(onBack).toHaveBeenCalled();
    });
  });

  // ── Inline editing ───────────────────────────────────────────

  it("enters inline edit mode and saves changes", async () => {
    const onPatch = vi.fn().mockResolvedValue(makePlaylist());
    render(<PlaylistDetailView {...defaultProps} onPatch={onPatch} />);

    fireEvent.click(screen.getByText("Edit"));

    // Title becomes an input
    const nameInput = screen.getByDisplayValue("My Playlist") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Renamed" } });

    // Description becomes a textarea
    const descTextarea = screen.getByDisplayValue("A test playlist") as HTMLTextAreaElement;
    fireEvent.change(descTextarea, { target: { value: "New desc" } });

    // Submit
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith(
        "user-1:my-playlist",
        expect.objectContaining({
          name: "Renamed",
          description: "New desc"
        })
      );
    });
  });

  it("inline edit shows visibility selector", async () => {
    render(<PlaylistDetailView {...defaultProps} />);

    fireEvent.click(screen.getByText("Edit"));

    const selects = screen.getAllByRole("combobox");
    const visibilitySelect = selects.find(
      (s) => (s as HTMLSelectElement).value === "public"
    ) as HTMLSelectElement;
    expect(visibilitySelect).toBeTruthy();
  });

  it("inline edit shows track list with drag handles", () => {
    render(<PlaylistDetailView {...defaultProps} />);

    fireEvent.click(screen.getByText("Edit"));

    // Drag handles appear in edit mode
    const dragHandles = screen.getAllByLabelText("Drag to reorder");
    expect(dragHandles.length).toBe(2);
  });

  it("inline edit allows removing tracks", async () => {
    const onPatch = vi.fn().mockResolvedValue(makePlaylist());
    render(<PlaylistDetailView {...defaultProps} onPatch={onPatch} />);

    fireEvent.click(screen.getByText("Edit"));

    // Remove first track
    const removeButtons = screen.getAllByLabelText("Remove track");
    fireEvent.click(removeButtons[0]!);

    // Save
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith(
        "user-1:my-playlist",
        expect.objectContaining({
          trackIds: ["t2"]
        })
      );
    });
  });

  it("inline edit cancel exits without saving", () => {
    const onPatch = vi.fn();
    render(<PlaylistDetailView {...defaultProps} onPatch={onPatch} />);

    fireEvent.click(screen.getByText("Edit"));
    // Save and Cancel buttons should be visible
    expect(screen.getByText("Save")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel"));
    // Edit button reappears, Save/Cancel disappear
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.queryByText("Save")).toBeNull();
    expect(onPatch).not.toHaveBeenCalled();
  });

  // ── Description display ──────────────────────────────────────

  it("hides description when empty", () => {
    const playlist = makePlaylist({ description: "" });
    render(
      <PlaylistDetailView
        {...defaultProps}
        availablePlaylists={[playlist]}
        manageablePlaylists={[playlist]}
      />
    );

    // The description paragraph should not be rendered
    expect(screen.queryByText("A test playlist")).toBeNull();
  });

  // ── Reports listen only once ─────────────────────────────────

  it("reports listen only once per playlist view", () => {
    const onReportListen = vi.fn().mockResolvedValue(undefined);
    render(<PlaylistDetailView {...defaultProps} onReportListen={onReportListen} />);

    fireEvent.click(screen.getByText("Play all"));
    fireEvent.click(screen.getByText("Shuffle"));

    expect(onReportListen).toHaveBeenCalledTimes(1);
  });
});
