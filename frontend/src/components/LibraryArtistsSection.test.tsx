/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AlbumEntry, ArtistEntry, Track } from "../types";
import { LibraryArtistsSection } from "./LibraryArtistsSection";

function createArtist(input: { name: string; albumCount?: number; trackCount: number; totalDuration?: number; previewTrackId?: string }): ArtistEntry {
  return {
    name: input.name,
    normalizedName: input.name.trim().toLowerCase(),
    albumCount: input.albumCount ?? 1,
    trackCount: input.trackCount,
    totalDuration: input.totalDuration ?? 0,
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

function createTrack(input: { id: string; title: string; artist: string; album: string; owner?: string }): Track {
  return {
    id: input.id,
    owner: input.owner ?? "owner-1",
    path: `storage/users/${input.owner ?? "owner-1"}/uploads/${input.id}.flac`,
    duration: 180,
    mimeType: "audio/flac",
    codec: "flac",
    tags: {
      title: input.title,
      artist: input.artist,
      album: input.album
    }
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
      selectedArtistAlbumTracks={[]}
      loadingSelectedArtistAlbumTracks={false}
      selectedArtistAlbumTracksError={null}
      loadingArtistAlbums={false}
      ownerNameById={{}}
      onArtistSelect={vi.fn()}
      onArtistBack={vi.fn()}
      onArtistAlbumSelect={vi.fn()}
      onArtistAlbumBack={vi.fn()}
      onArtistAlbumTrackSelect={vi.fn()}
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
    expect(screen.getByText(/2 tracks/)).toBeTruthy();
    expect(screen.getByText("Nujabes")).toBeTruthy();
    expect(screen.getByText(/1 track/)).toBeTruthy();
  });

  it("shows selected artist albums with AlbumList", () => {
    renderLibraryArtistsSection({
      selectedArtist: createArtist({ name: "Boards of Canada", trackCount: 2 }),
      artistAlbums: [createAlbum({ name: "Geogaddi", artist: "Boards of Canada", trackCount: 2 })]
    });

    expect(screen.getByRole("heading", { name: "Boards of Canada", level: 3 })).toBeTruthy();
    expect(screen.getByText("Geogaddi")).toBeTruthy();
  });

  it("calls onArtistSelect when an artist card is clicked", () => {
    const artist = createArtist({ name: "Nujabes", trackCount: 1 });
    const onArtistSelect = vi.fn();

    renderLibraryArtistsSection({ artists: [artist], onArtistSelect });

    fireEvent.click(screen.getByText("Nujabes"));
    expect(onArtistSelect).toHaveBeenCalledWith(artist);
  });

  it("shows selected artist album tracklist", () => {
    const album = createAlbum({ name: "Geogaddi", artist: "Boards of Canada", trackCount: 2 });
    renderLibraryArtistsSection({
      selectedArtist: createArtist({ name: "Boards of Canada", trackCount: 2 }),
      selectedArtistAlbum: album,
      selectedArtistAlbumTracks: [createTrack({ id: "t1", title: "Music Is Math", artist: "Boards of Canada", album: "Geogaddi" })]
    });

    expect(screen.getByRole("heading", { name: "Geogaddi", level: 3 })).toBeTruthy();
    expect(screen.getAllByText("Music Is Math").length).toBeGreaterThan(0);
  });
});
