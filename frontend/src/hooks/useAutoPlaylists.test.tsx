/* @vitest-environment happy-dom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAutoPlaylistsMock = vi.fn();

vi.mock("../api", () => ({
  getAutoPlaylists: (...args: unknown[]) => getAutoPlaylistsMock(...args)
}));

import { useAutoPlaylists } from "./useAutoPlaylists";

beforeEach(() => {
  getAutoPlaylistsMock.mockReset();
});

describe("useAutoPlaylists", () => {
  it("starts loading=true and returns an empty list until the fetch resolves", async () => {
    getAutoPlaylistsMock.mockResolvedValueOnce([{ id: "a", name: "Auto A" }]);
    const { result } = renderHook(() => useAutoPlaylists());

    expect(result.current.loading).toBe(true);
    expect(result.current.autoPlaylists).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.autoPlaylists).toEqual([{ id: "a", name: "Auto A" }]);
  });

  it("re-fetches when refresh() is called", async () => {
    getAutoPlaylistsMock
      .mockResolvedValueOnce([{ id: "first" }])
      .mockResolvedValueOnce([{ id: "second" }]);

    const { result } = renderHook(() => useAutoPlaylists());
    await waitFor(() =>
      expect(result.current.autoPlaylists).toEqual([{ id: "first" }])
    );

    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() =>
      expect(result.current.autoPlaylists).toEqual([{ id: "second" }])
    );
    expect(getAutoPlaylistsMock).toHaveBeenCalledTimes(2);
  });
});
