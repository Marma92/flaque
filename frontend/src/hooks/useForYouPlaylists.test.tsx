/* @vitest-environment happy-dom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getForYouPlaylistsMock = vi.fn();
const dismissForYouPlaylistMock = vi.fn();

vi.mock("../api", () => ({
  getForYouPlaylists: (...args: unknown[]) => getForYouPlaylistsMock(...args),
  dismissForYouPlaylist: (...args: unknown[]) => dismissForYouPlaylistMock(...args)
}));

import { useForYouPlaylists } from "./useForYouPlaylists";

beforeEach(() => {
  getForYouPlaylistsMock.mockReset();
  dismissForYouPlaylistMock.mockReset();
});

describe("useForYouPlaylists", () => {
  it("resolves the fetcher result and exposes it via forYouPlaylists", async () => {
    getForYouPlaylistsMock.mockResolvedValueOnce([
      { id: "p1", seedArtist: "A" },
      { id: "p2", seedArtist: "B" }
    ]);
    const { result } = renderHook(() => useForYouPlaylists());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.forYouPlaylists.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("optimistically removes the playlist when dismiss succeeds", async () => {
    getForYouPlaylistsMock.mockResolvedValueOnce([
      { id: "p1", seedArtist: "A" },
      { id: "p2", seedArtist: "B" }
    ]);
    dismissForYouPlaylistMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useForYouPlaylists());
    await waitFor(() => expect(result.current.forYouPlaylists).toHaveLength(2));

    await act(async () => {
      await result.current.dismiss("p1");
    });

    expect(result.current.forYouPlaylists.map((p) => p.id)).toEqual(["p2"]);
    expect(dismissForYouPlaylistMock).toHaveBeenCalledWith("p1");
  });

  it("propagates errors from the dismiss API and leaves the list untouched", async () => {
    getForYouPlaylistsMock.mockResolvedValueOnce([{ id: "p1" }]);
    dismissForYouPlaylistMock.mockRejectedValueOnce(new Error("nope"));

    const { result } = renderHook(() => useForYouPlaylists());
    await waitFor(() => expect(result.current.forYouPlaylists).toHaveLength(1));

    await expect(
      (async () => {
        await act(async () => {
          await result.current.dismiss("p1");
        });
      })()
    ).rejects.toThrow("nope");

    expect(result.current.forYouPlaylists.map((p) => p.id)).toEqual(["p1"]);
  });
});
