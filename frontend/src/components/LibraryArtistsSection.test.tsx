/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AlbumEntry, ArtistEntry } from "../types";
import { LibraryArtistsSection } from "./LibraryArtistsSection";

function createArtist(input: { name: string; trackCount: number; previewTrackId?: string }): ArtistEntry {
  return {
    name: input.name,
    trackCount: input.trackCount,
    previewTrackId: input.previewTrackId
  };
}

function createAlbum(input: { name: string; artist?: string; trackCount: number; previewTrackId?: string }): AlbumEntry {
  return {
    name: input.name,
    artist: input.artist,
    trackCount: input.trackCount,
    previewTrackId: input.previewTrackId
  };
}

function renderLibraryArtistsSection(
  overrides: Partial<ComponentProps<typeof LibraryArtistsSection>> = {}
): ReturnType<typeof render> {
  return render(
    <LibraryArtistsSection
      libraryMetadataError={null}
      loadingArtists={false}
      artists={[]}
      selectedArtist={null}
      artistAlbums={[]}
      selectedArtistAlbum={null}
      loadingArtistAlbums={false}
      onArtistSelect={vi.fn()}
      onArtistBack={vi.fn()}
      onArtistAlbumSelect={vi.fn()}
      {...overrides}
    />
  );
}

describe("LibraryArtistsSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows loading state", () => {
    renderLibraryArtistsSection({ loadingArtists: true });

    expect(screen.getByText("Loading artists...")).toBeTruthy();
  });

  it("shows empty state when artist list is empty", () => {
    renderLibraryArtistsSection();

    expect(screen.getByText("No artists found for these filters.")).toBeTruthy();
  });

  it("renders error and artist cards", () => {
    renderLibraryArtistsSection({
      libraryMetadataError: "Metadata endpoint unavailable",
      artists: [createArtist({ name: "Boards of Canada", trackCount: 2 }), createArtist({ name: "Nujabes", trackCount: 1 })]
    });

    expect(screen.getByText("Metadata endpoint unavailable")).toBeTruthy();
    expect(screen.getByText("Boards of Canada")).toBeTruthy();
    expect(screen.getByText("2 tracks")).toBeTruthy();
    expect(screen.getByText("Nujabes")).toBeTruthy();
    expect(screen.getByText("1 track")).toBeTruthy();
  });

  it("shows selected artist albums with AlbumList", () => {
    renderLibraryArtistsSection({
      selectedArtist: createArtist({ name: "Boards of Canada", trackCount: 2 }),
      artistAlbums: [createAlbum({ name: "Geogaddi", artist: "Boards of Canada", trackCount: 2 })]
    });

    expect(screen.getByText(/Albums for/i)).toBeTruthy();
    expect(screen.getByText("Geogaddi")).toBeTruthy();
  });

  it("calls onArtistSelect when an artist card is clicked", () => {
    const artist = createArtist({ name: "Nujabes", trackCount: 1 });
    const onArtistSelect = vi.fn();

    renderLibraryArtistsSection({ artists: [artist], onArtistSelect });

    fireEvent.click(screen.getByText("Nujabes"));
    expect(onArtistSelect).toHaveBeenCalledWith(artist);
  });
});
