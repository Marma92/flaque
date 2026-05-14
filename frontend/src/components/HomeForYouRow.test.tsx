/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ForYouPlaylistSummary } from "../types";
import { HomeForYouRow } from "./HomeForYouRow";

vi.mock("../api", () => ({
  coverPathUrl: (path: string) => `/mock-covers/${path}`
}));

function summary(input: Partial<ForYouPlaylistSummary> & { id: string; name: string }): ForYouPlaylistSummary {
  return {
    id: input.id,
    name: input.name,
    seedArtist: input.seedArtist ?? "Pink Floyd",
    seedArtistPhoto: input.seedArtistPhoto,
    trackCount: input.trackCount ?? 12,
    generatedAt: input.generatedAt ?? "2026-05-01T00:00:00.000Z"
  };
}

describe("HomeForYouRow", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when there are no playlists", () => {
    const { container } = render(<HomeForYouRow playlists={[]} onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one card per playlist with name and track count", () => {
    render(
      <HomeForYouRow
        playlists={[
          summary({ id: "for-you:pink-floyd", name: "Because you listen to Pink Floyd", trackCount: 14 }),
          summary({ id: "for-you:tame-impala", name: "Around Tame Impala", trackCount: 9 })
        ]}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("Because you listen to Pink Floyd")).toBeTruthy();
    expect(screen.getByText("Around Tame Impala")).toBeTruthy();
    expect(screen.getByText("14 tracks")).toBeTruthy();
    expect(screen.getByText("9 tracks")).toBeTruthy();
  });

  it("invokes onSelect with the playlist id when a card is clicked", () => {
    const onSelect = vi.fn();
    render(
      <HomeForYouRow
        playlists={[summary({ id: "for-you:pink-floyd", name: "Because you listen to Pink Floyd" })]}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByTitle("Because you listen to Pink Floyd"));

    expect(onSelect).toHaveBeenCalledWith("for-you:pink-floyd");
  });

  it("renders a gradient fallback with the first letter when no seedArtistPhoto", () => {
    render(
      <HomeForYouRow
        playlists={[
          summary({ id: "for-you:radiohead", name: "Around Radiohead", seedArtist: "Radiohead" })
        ]}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("R")).toBeTruthy();
  });

  it("renders an image when seedArtistPhoto is set", () => {
    render(
      <HomeForYouRow
        playlists={[
          summary({
            id: "for-you:tame-impala",
            name: "Around Tame Impala",
            seedArtist: "Tame Impala",
            seedArtistPhoto: "artists/tame-impala/photo.jpg"
          })
        ]}
        onSelect={vi.fn()}
      />
    );

    const img = screen.getByAltText("Tame Impala") as HTMLImageElement;
    expect(img.src).toContain("/mock-covers/artists/tame-impala/photo.jpg");
  });
});
