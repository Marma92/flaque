/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EnrichmentLogEntry } from "../../api";

const getLog = vi.fn();
const clearLog = vi.fn();

vi.mock("../../api", () => ({
  getEnrichmentLog: () => getLog(),
  clearEnrichmentLog: () => clearLog()
}));

import { EnrichmentLogPanel } from "./EnrichmentLogPanel";

const sampleEntry: EnrichmentLogEntry = {
  timestamp: "2026-05-14T10:00:00Z",
  trackId: "t1",
  artist: "Pixies",
  title: "Debaser",
  source: "bulk",
  status: "hit",
  filledGenre: ["Rock"],
  filledYear: 1989,
  coverFetched: true
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EnrichmentLogPanel", () => {
  it("renders entries with filled summary", async () => {
    getLog.mockResolvedValue([sampleEntry]);
    render(<EnrichmentLogPanel />);
    await waitFor(() => expect(screen.getByText("Debaser")).toBeTruthy());

    expect(screen.getByText("Pixies")).toBeTruthy();
    expect(screen.getByText("hit")).toBeTruthy();
    expect(screen.getByText(/genre: Rock/)).toBeTruthy();
    expect(screen.getByText(/year: 1989/)).toBeTruthy();
    expect(screen.getByText(/cover/)).toBeTruthy();
  });

  it("shows empty state when log is empty", async () => {
    getLog.mockResolvedValue([]);
    render(<EnrichmentLogPanel />);
    await waitFor(() => expect(screen.getByText(/No enrichment activity yet/i)).toBeTruthy());
  });

  it("calls clearEnrichmentLog when Clear log is clicked", async () => {
    getLog.mockResolvedValue([sampleEntry]);
    clearLog.mockResolvedValue(undefined);
    render(<EnrichmentLogPanel />);
    await waitFor(() => expect(screen.getByText("Debaser")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Clear log" }));
    await waitFor(() => expect(clearLog).toHaveBeenCalled());
  });

  it("re-fetches when refreshKey changes", async () => {
    getLog.mockResolvedValue([]);
    const { rerender } = render(<EnrichmentLogPanel refreshKey={0} />);
    await waitFor(() => expect(getLog).toHaveBeenCalledTimes(1));

    rerender(<EnrichmentLogPanel refreshKey={1} />);
    await waitFor(() => expect(getLog).toHaveBeenCalledTimes(2));
  });

  it("renders an error entry with the error message", async () => {
    getLog.mockResolvedValue([{
      ...sampleEntry,
      status: "failed",
      filledGenre: undefined,
      filledYear: undefined,
      coverFetched: false,
      errorMessage: "Network timeout"
    }]);
    render(<EnrichmentLogPanel />);
    await waitFor(() => expect(screen.getByText("failed")).toBeTruthy());
    expect(screen.getByText(/error: Network timeout/)).toBeTruthy();
  });
});
