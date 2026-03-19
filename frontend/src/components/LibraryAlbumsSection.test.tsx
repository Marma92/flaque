/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AlbumEntry, Track } from "../types";
import { LibraryAlbumsSection } from "./LibraryAlbumsSection";

function createAlbum(input: {
  id: string;
  name: string;
  artist: string;
  trackCount: number;
}): AlbumEntry {
  return {
    id: input.id,
    name: input.name,
    artist: input.artist,
    trackCount: input.trackCount
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
        onTrackSelect={onTrackSelect}
      />
    );

    expect(screen.getByText("Album route timeout")).toBeTruthy();
    expect(screen.getByText("Album tracks")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play Open Eye Signal" }));

    expect(onTrackSelect).toHaveBeenCalledWith(track);
  });
});
