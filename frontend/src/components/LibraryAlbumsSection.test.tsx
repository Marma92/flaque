/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AlbumEntry, Track } from "../types";
import { LibraryAlbumsSection } from "./LibraryAlbumsSection";

function createAlbum(input: {
  id: string;
  name: string;
  artist: string;
  trackCount: number;
  year?: number;
}): AlbumEntry {
  return {
    id: input.id,
    name: input.name,
    artist: input.artist,
    trackCount: input.trackCount,
    year: input.year
  };
}

function createTrack(input: { id: string; title: string; artist: string; album: string }): Track {
  return {
    id: input.id,
    owner: "user-1",
    path: `/music/${input.id}.flac`,
    duration: 215,
    mimeType: "audio/flac",
    codec: "flac",
    tags: {
      title: input.title,
      artist: input.artist,
      album: input.album,
      trackNumber: 1
    }
  };
}

describe("LibraryAlbumsSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows loading and empty states", () => {
    const onAlbumSelect = vi.fn();
    const onBack = vi.fn();
    const onTrackSelect = vi.fn();

    const { rerender } = render(
      <LibraryAlbumsSection
        libraryMetadataError={null}
        loadingAlbums={true}
        albums={[]}
        selectedAlbum={null}
        selectedAlbumTracks={[]}
        loadingSelectedAlbumTracks={false}
        selectedAlbumTracksError={null}
        ownerNameById={{}}
        onAlbumSelect={onAlbumSelect}
        onPlayAlbum={vi.fn()}
        onBack={onBack}
        onTrackSelect={onTrackSelect}
      />
    );

    expect(screen.getByText("Loading albums...")).toBeTruthy();

    rerender(
      <LibraryAlbumsSection
        libraryMetadataError={null}
        loadingAlbums={false}
        albums={[]}
        selectedAlbum={null}
        selectedAlbumTracks={[]}
        loadingSelectedAlbumTracks={false}
        selectedAlbumTracksError={null}
        ownerNameById={{}}
        onAlbumSelect={onAlbumSelect}
        onPlayAlbum={vi.fn()}
        onBack={onBack}
        onTrackSelect={onTrackSelect}
      />
    );

    expect(screen.getByText("No albums found for these filters.")).toBeTruthy();
  });

  it("calls onAlbumSelect when an album card is clicked", () => {
    const album = createAlbum({
      id: "album-1",
      name: "Dive",
      artist: "Tycho",
      trackCount: 3
    });
    const onAlbumSelect = vi.fn();

    render(
      <LibraryAlbumsSection
        libraryMetadataError={null}
        loadingAlbums={false}
        albums={[album]}
        selectedAlbum={null}
        selectedAlbumTracks={[]}
        loadingSelectedAlbumTracks={false}
        selectedAlbumTracksError={null}
        ownerNameById={{}}
        onAlbumSelect={onAlbumSelect}
        onPlayAlbum={vi.fn()}
        onBack={vi.fn()}
        onTrackSelect={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle("Tycho - Dive"));

    expect(onAlbumSelect).toHaveBeenCalledWith(album);
  });

  it("renders selected album tracks and handles track selection", () => {
    const album = createAlbum({
      id: "album-2",
      name: "Immunity",
      artist: "Jon Hopkins",
      trackCount: 1
    });
    const track = createTrack({
      id: "track-1",
      title: "Open Eye Signal",
      artist: "Jon Hopkins",
      album: "Immunity"
    });
    const onTrackSelect = vi.fn();

    render(
      <LibraryAlbumsSection
        libraryMetadataError={"Album route timeout"}
        loadingAlbums={false}
        albums={[album]}
        selectedAlbum={album}
        selectedAlbumTracks={[track]}
        loadingSelectedAlbumTracks={false}
        selectedAlbumTracksError={null}
        ownerNameById={{ "user-1": "Alice" }}
        onAlbumSelect={vi.fn()}
        onPlayAlbum={vi.fn()}
        onBack={vi.fn()}
        onTrackSelect={onTrackSelect}
      />
    );

    expect(screen.getByText("Album route timeout")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Immunity", level: 3 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play Open Eye Signal" }));

    expect(onTrackSelect).toHaveBeenCalledWith(track);
  });

  it("adds a track to playlist from the plus button without triggering playback", async () => {
    const album = createAlbum({
      id: "album-3",
      name: "Typhoons",
      artist: "Royal Blood",
      trackCount: 1
    });
    const track = createTrack({
      id: "track-2",
      title: "Trouble's Coming",
      artist: "Royal Blood",
      album: "Typhoons"
    });
    const playlist = {
      id: "playlist-1",
      name: "Workout",
      authorId: "user-1",
      visibility: "private" as const,
      trackIds: [],
      description: "",
      cover: null,
      hearts: [],
      heartCount: 0,
      listenCount: 0,
      collaborators: []
    };
    const onTrackSelect = vi.fn();
    const onAddTrackToPlaylist = vi.fn().mockResolvedValue(undefined);

    render(
      <LibraryAlbumsSection
        libraryMetadataError={null}
        loadingAlbums={false}
        albums={[album]}
        selectedAlbum={album}
        selectedAlbumTracks={[track]}
        loadingSelectedAlbumTracks={false}
        selectedAlbumTracksError={null}
        ownerNameById={{ "user-1": "Alice" }}
        onAlbumSelect={vi.fn()}
        onPlayAlbum={vi.fn()}
        onBack={vi.fn()}
        onTrackSelect={onTrackSelect}
        playlists={[playlist]}
        onAddTrackToPlaylist={onAddTrackToPlaylist}
      />
    );

    const addTrackButtons = screen.getAllByRole("button", { name: "Add Trouble's Coming to playlist" });
    fireEvent.click(addTrackButtons[0]);
    expect(onTrackSelect).not.toHaveBeenCalled();

    const confirmAddButtons = screen.getAllByRole("button", { name: "Add" });
    fireEvent.click(confirmAddButtons[0]);

    await waitFor(() => {
      expect(onAddTrackToPlaylist).toHaveBeenCalledWith({
        trackId: "track-2",
        playlistId: "playlist-1"
      });
    });
    expect(onTrackSelect).not.toHaveBeenCalled();
  });

  it("hides album list in list mode when a tracklist is shown and supports back", () => {
    const album = createAlbum({
      id: "album-4",
      name: "Discovery",
      artist: "Daft Punk",
      trackCount: 2
    });
    const onBack = vi.fn();

    render(
      <LibraryAlbumsSection
        libraryMetadataError={null}
        loadingAlbums={false}
        albums={[album]}
        selectedAlbum={album}
        selectedAlbumTracks={[]}
        loadingSelectedAlbumTracks={false}
        selectedAlbumTracksError={null}
        ownerNameById={{}}
        onAlbumSelect={vi.fn()}
        onPlayAlbum={vi.fn()}
        onBack={onBack}
        onTrackSelect={vi.fn()}
      />
    );

    expect(screen.queryByAltText("Cover for Daft Punk - Discovery")).toBeNull();

    const backButton = screen.getByRole("button", { name: "Back" });
    fireEvent.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("groups albums by first letter by default and re-groups by year on sort change", () => {
    const albums = [
      createAlbum({ id: "1", name: "Alpha", artist: "X", trackCount: 1, year: 2020 }),
      createAlbum({ id: "2", name: "Bravo", artist: "Y", trackCount: 1, year: 1999 }),
      createAlbum({ id: "3", name: "Charlie", artist: "Z", trackCount: 1 })
    ];

    try {
      window.localStorage.removeItem("flaque.albums.sort");
    } catch {
      // ignore
    }

    render(
      <LibraryAlbumsSection
        libraryMetadataError={null}
        loadingAlbums={false}
        albums={albums}
        selectedAlbum={null}
        selectedAlbumTracks={[]}
        loadingSelectedAlbumTracks={false}
        selectedAlbumTracksError={null}
        ownerNameById={{}}
        onAlbumSelect={vi.fn()}
        onPlayAlbum={vi.fn()}
        onBack={vi.fn()}
        onTrackSelect={vi.fn()}
      />
    );

    // Default = album-asc: section headers A, B, C
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("C")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Sort albums"), { target: { value: "year-desc" } });

    // Now grouped by year: 2020, 1999, Unknown — labels also appear in cards so use getAllByText
    expect(screen.getAllByText("2020").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1999").length).toBeGreaterThan(0);
    expect(screen.getByText("Unknown")).toBeTruthy();
  });
});
