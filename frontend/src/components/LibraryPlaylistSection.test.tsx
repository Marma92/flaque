/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Playlist } from "../types";
import { LibraryPlaylistSection } from "./LibraryPlaylistSection";

function createPlaylist(input: {
  id: string;
  name: string;
  authorId: string;
  visibility?: "private" | "public";
  trackIds?: string[];
}): Playlist {
  return {
    id: input.id,
    name: input.name,
    authorId: input.authorId,
    visibility: input.visibility ?? "private",
    trackIds: input.trackIds ?? [],
    description: "",
    cover: null,
    hearts: [],
    heartCount: 0,
    listenCount: 0,
    collaborators: []
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
  autoPlaylists: [],
  loadingAutoPlaylists: false,
  forYouPlaylists: [],
  loadingForYouPlaylists: false,
  onDismissForYouPlaylist: vi.fn().mockResolvedValue(undefined),
  onHeartPlaylist: vi.fn().mockResolvedValue(undefined)
};

describe("LibraryPlaylistSection", () => {
  afterEach(() => {
    cleanup();
  });

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
});
