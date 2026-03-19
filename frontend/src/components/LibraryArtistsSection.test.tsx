/* @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ArtistEntry } from "../types";
import { LibraryArtistsSection } from "./LibraryArtistsSection";

function createArtist(input: { name: string; trackCount: number; previewTrackId?: string }): ArtistEntry {
  return {
    name: input.name,
    trackCount: input.trackCount,
    previewTrackId: input.previewTrackId
  };
}

describe("LibraryArtistsSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows loading state", () => {
    render(<LibraryArtistsSection libraryMetadataError={null} loadingArtists={true} artists={[]} />);

    expect(screen.getByText("Loading artists...")).toBeTruthy();
  });

  it("shows empty state when artist list is empty", () => {
    render(<LibraryArtistsSection libraryMetadataError={null} loadingArtists={false} artists={[]} />);

    expect(screen.getByText("No artists found for these filters.")).toBeTruthy();
  });

  it("renders error and artist cards", () => {
    render(
      <LibraryArtistsSection
        libraryMetadataError="Metadata endpoint unavailable"
        loadingArtists={false}
        artists={[
          createArtist({ name: "Boards of Canada", trackCount: 2 }),
          createArtist({ name: "Nujabes", trackCount: 1 })
        ]}
      />
    );

    expect(screen.getByText("Metadata endpoint unavailable")).toBeTruthy();
    expect(screen.getByText("Boards of Canada")).toBeTruthy();
    expect(screen.getByText("2 tracks")).toBeTruthy();
    expect(screen.getByText("Nujabes")).toBeTruthy();
    expect(screen.getByText("1 track")).toBeTruthy();
  });
});
