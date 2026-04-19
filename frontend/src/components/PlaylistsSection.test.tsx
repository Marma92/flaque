/* @vitest-environment happy-dom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./AutoPlaylistDetailView", () => ({
  AutoPlaylistDetailView: ({ playlistId }: { playlistId: string }) => (
    <div data-testid="auto-detail">{playlistId}</div>
  )
}));

vi.mock("./ForYouPlaylistDetailView", () => ({
  ForYouPlaylistDetailView: ({ playlistId }: { playlistId: string }) => (
    <div data-testid="foryou-detail">{playlistId}</div>
  )
}));

vi.mock("./PlaylistDetailView", () => ({
  PlaylistDetailView: ({ playlistId }: { playlistId: string }) => (
    <div data-testid="playlist-detail">{playlistId}</div>
  )
}));

vi.mock("./LibraryPlaylistSection", () => ({
  LibraryPlaylistSection: () => <div data-testid="library-playlists" />
}));

import type { Track, User } from "../types";
import { PlaylistsSection, type PlaylistsSectionProps } from "./PlaylistsSection";

const USER: User = {
  id: "user-1",
  username: "alice",
  email: "a@b.c",
  role: "user"
};

function baseProps(overrides: Partial<PlaylistsSectionProps> = {}): PlaylistsSectionProps {
  return {
    playlistDetailId: null,
    onPlaylistDetailNavigate: vi.fn(),
    availablePlaylists: [],
    manageablePlaylists: [],
    ownerNameById: {},
    allTracksById: new Map<string, Track>(),
    user: USER,
    onCreatePlaylist: vi.fn(),
    onPlayPlaylist: vi.fn(),
    onPatchPlaylist: vi.fn(),
    onDeletePlaylist: vi.fn(),
    onHeartPlaylist: vi.fn(),
    onReportPlaylistListen: vi.fn(),
    autoPlaylists: [],
    loadingAutoPlaylists: false,
    forYouPlaylists: [],
    loadingForYouPlaylists: false,
    onDismissForYouPlaylist: vi.fn(),
    ...overrides
  };
}

describe("PlaylistsSection", () => {
  it("renders the library section when no detail id is selected", () => {
    render(<PlaylistsSection {...baseProps()} />);
    expect(screen.getByTestId("library-playlists")).toBeTruthy();
    expect(screen.queryByTestId("auto-detail")).toBeNull();
    expect(screen.queryByTestId("foryou-detail")).toBeNull();
    expect(screen.queryByTestId("playlist-detail")).toBeNull();
  });

  it("routes for-you ids to ForYouPlaylistDetailView", () => {
    render(<PlaylistsSection {...baseProps({ playlistDetailId: "for-you:pop" })} />);
    expect(screen.getByTestId("foryou-detail").textContent).toBe("for-you:pop");
  });

  it("routes auto ids to AutoPlaylistDetailView", () => {
    render(<PlaylistsSection {...baseProps({ playlistDetailId: "auto:70s-rock" })} />);
    expect(screen.getByTestId("auto-detail").textContent).toBe("auto:70s-rock");
  });

  it("routes any other id to the regular PlaylistDetailView", () => {
    render(<PlaylistsSection {...baseProps({ playlistDetailId: "user-playlist-42" })} />);
    expect(screen.getByTestId("playlist-detail").textContent).toBe("user-playlist-42");
  });
});
