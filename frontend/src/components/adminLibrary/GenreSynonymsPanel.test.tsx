/* @vitest-environment happy-dom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";

const getSynonyms = vi.fn();
const putSynonym = vi.fn();
const deleteSynonym = vi.fn();
const resetSynonyms = vi.fn();
const reapplySynonyms = vi.fn();

vi.mock("../../api", () => ({
  getGenreSynonyms: () => getSynonyms(),
  putGenreSynonym: (...args: unknown[]) => putSynonym(...args),
  deleteGenreSynonym: (...args: unknown[]) => deleteSynonym(...args),
  resetGenreSynonyms: () => resetSynonyms(),
  reapplyGenreSynonyms: () => reapplySynonyms()
}));

import { GenreSynonymsPanel, type GenreSynonymsPanelHandle } from "./GenreSynonymsPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GenreSynonymsPanel", () => {
  it("renders loaded synonyms sorted by key", async () => {
    getSynonyms.mockResolvedValue({ zeta: "Zeta", alpha: "Alpha" });
    render(<GenreSynonymsPanel />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeTruthy());
    const rows = screen.getAllByRole("row");
    // First row is the header. Second row is "alpha" (sorted before zeta).
    expect(rows[1]?.textContent).toContain("alpha");
    expect(rows[2]?.textContent).toContain("zeta");
  });

  it("calls putGenreSynonym then refreshes on submit", async () => {
    getSynonyms.mockResolvedValue({});
    putSynonym.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<GenreSynonymsPanel onSynonymsChanged={onChanged} />);
    await waitFor(() => expect(getSynonyms).toHaveBeenCalled());

    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[0]!, { target: { value: "myalias" } });
    fireEvent.change(inputs[1]!, { target: { value: "My Genre" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(putSynonym).toHaveBeenCalledWith("myalias", "My Genre"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("calls deleteGenreSynonym and refreshes when Delete is clicked", async () => {
    getSynonyms.mockResolvedValue({ bye: "Bye" });
    deleteSynonym.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<GenreSynonymsPanel onSynonymsChanged={onChanged} />);
    await waitFor(() => expect(screen.getByText("bye")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteSynonym).toHaveBeenCalledWith("bye"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("reports the reapply counts in the status line", async () => {
    getSynonyms.mockResolvedValue({});
    reapplySynonyms.mockResolvedValue({ scanned: 42, updated: 7 });
    render(<GenreSynonymsPanel />);
    await waitFor(() => expect(getSynonyms).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Reapply to library" }));
    await waitFor(() => expect(reapplySynonyms).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText(/Reapplied synonyms: 7 of 42 tracks updated/i)).toBeTruthy()
    );
  });

  it("promoteLabel ref pre-fills the From input", async () => {
    getSynonyms.mockResolvedValue({});
    const ref = createRef<GenreSynonymsPanelHandle>();
    render(<GenreSynonymsPanel ref={ref} />);
    await waitFor(() => expect(getSynonyms).toHaveBeenCalled());

    act(() => ref.current?.promoteLabel("Hip Hop"));

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs[0]?.value).toBe("hip hop");
  });
});
