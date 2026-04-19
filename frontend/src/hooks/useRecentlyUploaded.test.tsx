/* @vitest-environment happy-dom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTracksMock = vi.fn();

vi.mock("../api", () => ({
  getTracks: (...args: unknown[]) => getTracksMock(...args)
}));

import type { User } from "../types";
import { useRecentlyUploaded } from "./useRecentlyUploaded";

const USER: User = {
  id: "user-1",
  username: "alice",
  email: "alice@example.com",
  role: "user"
};

beforeEach(() => {
  getTracksMock.mockReset();
});

describe("useRecentlyUploaded", () => {
  it("does not fetch when no user is signed in", async () => {
    const { result } = renderHook(() =>
      useRecentlyUploaded({ user: null })
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.tracks).toEqual([]);
    expect(getTracksMock).not.toHaveBeenCalled();
  });

  it("requests tracks sorted by addedAt desc with the 7d window by default", async () => {
    getTracksMock.mockResolvedValueOnce({
      tracks: [{ id: "t1" }, { id: "t2" }]
    });

    const { result } = renderHook(() => useRecentlyUploaded({ user: USER }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const call = getTracksMock.mock.calls[0]?.[0];
    expect(call).toMatchObject({
      sortBy: "addedAt",
      sortDir: "desc",
      limit: 12
    });
    expect(typeof call.addedAfter).toBe("string");
    expect(result.current.period).toBe("7d");
    expect(result.current.tracks.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("re-fetches with a wider addedAfter window when period flips to 30d", async () => {
    getTracksMock.mockResolvedValue({ tracks: [] });
    const { result } = renderHook(() => useRecentlyUploaded({ user: USER }));
    await waitFor(() => expect(getTracksMock).toHaveBeenCalledTimes(1));
    const first = getTracksMock.mock.calls[0]![0].addedAfter as string;

    await act(async () => {
      result.current.setPeriod("30d");
    });
    await waitFor(() => expect(getTracksMock).toHaveBeenCalledTimes(2));

    const second = getTracksMock.mock.calls[1]![0].addedAfter as string;
    expect(new Date(second).getTime()).toBeLessThan(new Date(first).getTime());
  });

  it("forwards the ownerFilter argument to the API call", async () => {
    getTracksMock.mockResolvedValueOnce({ tracks: [] });
    renderHook(() =>
      useRecentlyUploaded({ user: USER, ownerFilter: "user-2" })
    );
    await waitFor(() => expect(getTracksMock).toHaveBeenCalled());
    expect(getTracksMock.mock.calls[0]?.[0].owner).toBe("user-2");
  });
});
