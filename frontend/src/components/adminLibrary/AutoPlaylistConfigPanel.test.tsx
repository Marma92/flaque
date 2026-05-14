/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getConfig = vi.fn();
const patchConfig = vi.fn();
const regenerate = vi.fn();

vi.mock("../../api", () => ({
  getAutoPlaylistConfig: () => getConfig(),
  patchAutoPlaylistConfig: (...args: unknown[]) => patchConfig(...args),
  regenerateAutoPlaylists: () => regenerate()
}));

import { AutoPlaylistConfigPanel } from "./AutoPlaylistConfigPanel";

const baseConfig = {
  maxPlaylists: 5,
  minTracksPerPlaylist: 10,
  tracksPerPlaylist: 20
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AutoPlaylistConfigPanel", () => {
  it("populates fields from the loaded config", async () => {
    getConfig.mockResolvedValue(baseConfig);
    render(<AutoPlaylistConfigPanel />);
    await waitFor(() => expect(screen.getByDisplayValue("5")).toBeTruthy());
    expect(screen.getByDisplayValue("10")).toBeTruthy();
    expect(screen.getByDisplayValue("20")).toBeTruthy();
  });

  it("submits a patch with parsed integer values", async () => {
    getConfig.mockResolvedValue(baseConfig);
    patchConfig.mockResolvedValue({ ...baseConfig, maxPlaylists: 9 });
    render(<AutoPlaylistConfigPanel />);
    await waitFor(() => expect(screen.getByDisplayValue("5")).toBeTruthy());

    const maxInput = screen.getByDisplayValue("5") as HTMLInputElement;
    fireEvent.change(maxInput, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));

    await waitFor(() => expect(patchConfig).toHaveBeenCalledWith({
      maxPlaylists: 9,
      minTracksPerPlaylist: 10,
      tracksPerPlaylist: 20
    }));
    await waitFor(() => expect(screen.getByText("Configuration saved.")).toBeTruthy());
  });

  it("calls regenerate and reports the result", async () => {
    getConfig.mockResolvedValue(baseConfig);
    regenerate.mockResolvedValue({ regenerated: 3 });
    const onRegen = vi.fn();
    render(<AutoPlaylistConfigPanel onAutoPlaylistsRegenerated={onRegen} />);
    await waitFor(() => expect(screen.getByDisplayValue("5")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Regenerate now" }));
    await waitFor(() => expect(regenerate).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Regenerated 3 playlists.")).toBeTruthy());
    expect(onRegen).toHaveBeenCalled();
  });

  it("reports an error when regenerate throws", async () => {
    getConfig.mockResolvedValue(baseConfig);
    regenerate.mockRejectedValue(new Error("boom"));
    render(<AutoPlaylistConfigPanel />);
    await waitFor(() => expect(screen.getByDisplayValue("5")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Regenerate now" }));
    await waitFor(() => expect(screen.getByText("boom")).toBeTruthy());
  });
});
