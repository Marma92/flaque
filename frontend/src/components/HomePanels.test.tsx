/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HomePanels } from "./HomePanels";

vi.mock("../api", () => ({
  coverUrl: (trackId: string, coverPath?: string) => coverPath ?? `/mock-covers/${trackId}`,
  coverPathUrl: (path: string) => `/mock-covers/${path}`
}));

function renderEmptyHome(overrides: {
  onStartRadioPlayback?: () => void;
  onNavigateToLibrary?: () => void;
  onNavigateToPlaylists?: () => void;
} = {}): void {
  render(
    <HomePanels
      recentTracks={[]}
      onRecentTrackReplay={vi.fn()}
      recentlyUploadedItems={[]}
      recentlyUploadedLoading={false}
      recentlyUploadedPeriod="7d"
      onRecentlyUploadedPeriodChange={vi.fn()}
      onRecentlyUploadedTrackSelect={vi.fn()}
      onRecentlyUploadedAlbumPlay={vi.fn()}
      onRecentlyUploadedAlbumOpen={vi.fn()}
      onStartRadioPlayback={overrides.onStartRadioPlayback}
      onNavigateToLibrary={overrides.onNavigateToLibrary}
      onNavigateToPlaylists={overrides.onNavigateToPlaylists}
    />
  );
}

describe("HomePanels empty state", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the three quick-action chips when all callbacks are provided", () => {
    renderEmptyHome({
      onStartRadioPlayback: vi.fn(),
      onNavigateToLibrary: vi.fn(),
      onNavigateToPlaylists: vi.fn()
    });

    expect(screen.getByText("Oh flaque !")).toBeTruthy();
    expect(screen.getByRole("button", { name: /tune in to flaque fm/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /browse library/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /view playlists/i })).toBeTruthy();
  });

  it("invokes the corresponding callback when each chip is clicked", () => {
    const onStartRadioPlayback = vi.fn();
    const onNavigateToLibrary = vi.fn();
    const onNavigateToPlaylists = vi.fn();
    renderEmptyHome({ onStartRadioPlayback, onNavigateToLibrary, onNavigateToPlaylists });

    fireEvent.click(screen.getByRole("button", { name: /tune in to flaque fm/i }));
    fireEvent.click(screen.getByRole("button", { name: /browse library/i }));
    fireEvent.click(screen.getByRole("button", { name: /view playlists/i }));

    expect(onStartRadioPlayback).toHaveBeenCalledTimes(1);
    expect(onNavigateToLibrary).toHaveBeenCalledTimes(1);
    expect(onNavigateToPlaylists).toHaveBeenCalledTimes(1);
  });

  it("hides individual chips when their callback is missing", () => {
    renderEmptyHome({ onNavigateToLibrary: vi.fn() });

    expect(screen.queryByRole("button", { name: /tune in to flaque fm/i })).toBeNull();
    expect(screen.getByRole("button", { name: /browse library/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /view playlists/i })).toBeNull();
  });
});
