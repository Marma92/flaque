/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getLabels = vi.fn();

vi.mock("../../api", () => ({
  getLibraryGenreLabels: () => getLabels()
}));

import { LibraryLabelsPanel } from "./LibraryLabelsPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("LibraryLabelsPanel", () => {
  it("renders labels with counts and canonical mapping", async () => {
    getLabels.mockResolvedValue([
      { label: "hiphop", count: 12, canonical: "Hip-Hop" },
      { label: "Rock", count: 3 }
    ]);
    render(<LibraryLabelsPanel onPromote={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("hiphop")).toBeTruthy());

    expect(screen.getByText("Hip-Hop")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("Rock")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("calls onPromote with the raw label when Promote is clicked", async () => {
    getLabels.mockResolvedValue([{ label: "hiphop", count: 1, canonical: "Hip-Hop" }]);
    const onPromote = vi.fn();
    render(<LibraryLabelsPanel onPromote={onPromote} />);
    await waitFor(() => expect(screen.getByText("hiphop")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Promote" }));
    expect(onPromote).toHaveBeenCalledWith("hiphop");
  });

  it("re-fetches when refreshKey changes", async () => {
    getLabels.mockResolvedValue([]);
    const { rerender } = render(<LibraryLabelsPanel onPromote={vi.fn()} refreshKey={0} />);
    await waitFor(() => expect(getLabels).toHaveBeenCalledTimes(1));

    rerender(<LibraryLabelsPanel onPromote={vi.fn()} refreshKey={1} />);
    await waitFor(() => expect(getLabels).toHaveBeenCalledTimes(2));
  });

  it("manual refresh button re-fetches", async () => {
    getLabels.mockResolvedValue([]);
    render(<LibraryLabelsPanel onPromote={vi.fn()} />);
    await waitFor(() => expect(getLabels).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(getLabels).toHaveBeenCalledTimes(2));
  });

  it("shows empty-state when there are no labels", async () => {
    getLabels.mockResolvedValue([]);
    render(<LibraryLabelsPanel onPromote={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No genre labels found/i)).toBeTruthy());
  });
});
