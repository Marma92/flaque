/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Track } from "../types";
import { ResumeRow } from "./ResumeRow";

vi.mock("../api", () => ({
  coverUrl: (trackId: string, coverPath?: string) => coverPath ?? `/mock-covers/${trackId}`
}));

function createTrack(): Track {
  return {
    id: "track-1",
    owner: "user-1",
    path: "/music/track-1.flac",
    duration: 240,
    mimeType: "audio/flac",
    codec: "flac",
    tags: {
      title: "Animals",
      artist: "Pink Floyd",
      album: "Animals",
      trackNumber: 1
    }
  };
}

describe("ResumeRow", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the title, artist, and a clamped position label", () => {
    render(
      <ResumeRow
        track={createTrack()}
        positionSec={120}
        onResume={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("Animals")).toBeTruthy();
    expect(screen.getByText("Pink Floyd")).toBeTruthy();
    // Format: 2:00 / 4:00
    expect(screen.getByText("2:00 / 4:00")).toBeTruthy();
  });

  it("invokes onResume with the track and clamped position when Resume is clicked", () => {
    const onResume = vi.fn();
    const track = createTrack();
    render(
      <ResumeRow track={track} positionSec={60} onResume={onResume} onDismiss={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: /resume/i }));

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledWith(track, 60);
  });

  it("invokes onDismiss when Dismiss is clicked", () => {
    const onDismiss = vi.fn();
    render(
      <ResumeRow
        track={createTrack()}
        positionSec={30}
        onResume={vi.fn()}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("clamps a position past the track duration to the duration", () => {
    const onResume = vi.fn();
    const track = createTrack();
    render(
      <ResumeRow track={track} positionSec={9999} onResume={onResume} onDismiss={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: /resume/i }));

    expect(onResume).toHaveBeenCalledWith(track, 240);
  });
});
