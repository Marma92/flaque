/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSettings = vi.fn();
const patchSettings = vi.fn();

vi.mock("../../api", () => ({
  getLibrarySettings: () => getSettings(),
  patchLibrarySettings: (...args: unknown[]) => patchSettings(...args)
}));

import { AiRecommendationPanel } from "./AiRecommendationPanel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AiRecommendationPanel", () => {
  it("renders enabled state when the setting is true", async () => {
    getSettings.mockResolvedValue({ aiRecommendation: true });
    render(<AiRecommendationPanel />);
    await waitFor(() => expect(screen.getByText("Enabled")).toBeTruthy());
    expect(
      (screen.getByLabelText("Enable AI recommendation") as HTMLInputElement).checked
    ).toBe(true);
    expect(screen.getByText(/Using CLAP/)).toBeTruthy();
  });

  it("renders disabled state when the setting is false", async () => {
    getSettings.mockResolvedValue({ aiRecommendation: false });
    render(<AiRecommendationPanel />);
    await waitFor(() => expect(screen.getByText("Disabled")).toBeTruthy());
    expect(
      (screen.getByLabelText("Enable AI recommendation") as HTMLInputElement).checked
    ).toBe(false);
    expect(screen.getByText(/Using legacy MFCC/)).toBeTruthy();
  });

  it("toggles the setting and shows the disable message", async () => {
    getSettings.mockResolvedValue({ aiRecommendation: true });
    patchSettings.mockResolvedValue({ aiRecommendation: false });
    render(<AiRecommendationPanel />);
    await waitFor(() => expect(screen.getByText("Enabled")).toBeTruthy());

    const checkbox = screen.getByLabelText("Enable AI recommendation") as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(patchSettings).toHaveBeenCalledWith({ aiRecommendation: false })
    );
    await waitFor(() => expect(screen.getByText("Disabled")).toBeTruthy());
    expect(screen.getByText(/AI recommendation disabled/)).toBeTruthy();
  });

  it("toggles the setting back on and shows the enable message", async () => {
    getSettings.mockResolvedValue({ aiRecommendation: false });
    patchSettings.mockResolvedValue({ aiRecommendation: true });
    render(<AiRecommendationPanel />);
    await waitFor(() => expect(screen.getByText("Disabled")).toBeTruthy());

    const checkbox = screen.getByLabelText("Enable AI recommendation") as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(patchSettings).toHaveBeenCalledWith({ aiRecommendation: true })
    );
    await waitFor(() => expect(screen.getByText("Enabled")).toBeTruthy());
    expect(screen.getByText(/AI recommendation enabled/)).toBeTruthy();
  });

  it("surfaces an error message when the patch fails", async () => {
    getSettings.mockResolvedValue({ aiRecommendation: true });
    patchSettings.mockRejectedValue(new Error("server is down"));
    render(<AiRecommendationPanel />);
    await waitFor(() => expect(screen.getByText("Enabled")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Enable AI recommendation"));

    await waitFor(() => expect(screen.getByText(/server is down/)).toBeTruthy());
  });
});
