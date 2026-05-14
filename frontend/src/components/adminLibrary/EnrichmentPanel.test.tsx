/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EnrichmentStatus, GenreCacheStats } from "../../api";

const getStatus = vi.fn();
const getStats = vi.fn();
const start = vi.fn();
const stop = vi.fn();
const clearCache = vi.fn();

vi.mock("../../api", () => ({
  getEnrichmentStatus: () => getStatus(),
  getGenreCacheStats: () => getStats(),
  startEnrichment: () => start(),
  stopEnrichment: () => stop(),
  clearGenreCache: () => clearCache()
}));

import { EnrichmentPanel } from "./EnrichmentPanel";

const idleStatus: EnrichmentStatus = {
  running: false,
  processed: 0,
  total: 0,
  enriched: 0,
  failed: 0,
  startedAt: null,
  currentTrack: null
};

const cacheStats: GenreCacheStats = {
  entries: 42,
  fingerprints: 5,
  acoustid: 3,
  acoustIdConfigured: true,
  fingerprintingAvailable: true
};

beforeEach(() => {
  getStatus.mockResolvedValue(idleStatus);
  getStats.mockResolvedValue(cacheStats);
  start.mockResolvedValue(undefined);
  stop.mockResolvedValue(undefined);
  clearCache.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EnrichmentPanel", () => {
  it("renders the Start button when idle", async () => {
    render(<EnrichmentPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Start enrichment" })).toBeTruthy());
  });

  it("renders cache stats and feature-flag pills", async () => {
    render(<EnrichmentPanel />);
    await waitFor(() => expect(screen.getByText(/42 MB entries/)).toBeTruthy());
    expect(screen.getByText(/AcoustID: configured/)).toBeTruthy();
    expect(screen.getByText(/fpcalc: available/)).toBeTruthy();
  });

  it("flips to Stop button when status reports running", async () => {
    const runningStatus: EnrichmentStatus = {
      ...idleStatus,
      running: true,
      total: 10,
      processed: 3,
      enriched: 2,
      startedAt: "2026-05-14T10:00:00Z",
      currentTrack: { trackId: "t1", artist: "A", title: "B" }
    };
    getStatus.mockResolvedValue(runningStatus);

    render(<EnrichmentPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop enrichment" })).toBeTruthy());
    expect(screen.getByText(/3 \/ 10 tracks processed/)).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
  });

  it("calls startEnrichment when Start is clicked", async () => {
    render(<EnrichmentPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Start enrichment" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Start enrichment" }));
    await waitFor(() => expect(start).toHaveBeenCalled());
  });

  it("calls clearGenreCache and refreshes when Clear cache is clicked", async () => {
    render(<EnrichmentPanel />);
    await waitFor(() => expect(screen.getByText(/42 MB entries/)).toBeTruthy());

    getStats.mockResolvedValueOnce({ ...cacheStats, entries: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Clear cache" }));
    await waitFor(() => expect(clearCache).toHaveBeenCalled());
  });

  it("forwards status to onPollTick on initial fetch", async () => {
    const onPollTick = vi.fn();
    render(<EnrichmentPanel onPollTick={onPollTick} />);
    await waitFor(() => expect(onPollTick).toHaveBeenCalled());
    expect(onPollTick.mock.calls[0]?.[0]).toEqual(idleStatus);
  });
});
