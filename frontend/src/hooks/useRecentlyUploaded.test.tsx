/* @vitest-environment happy-dom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getRecentUploadsMock = vi.fn();

vi.mock("../api", () => ({
  getRecentUploads: (...args: unknown[]) => getRecentUploadsMock(...args)
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
  getRecentUploadsMock.mockReset();
});

describe("useRecentlyUploaded", () => {
  it("does not fetch when no user is signed in", async () => {
    const { result } = renderHook(() =>
      useRecentlyUploaded({ user: null })
    );

    expect(result.current.loading).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(getRecentUploadsMock).not.toHaveBeenCalled();
  });

  it("requests recent uploads with the 7d window by default", async () => {
    getRecentUploadsMock.mockResolvedValueOnce([
      { kind: "track", track: { id: "t1" } },
      { kind: "track", track: { id: "t2" } }
    ]);

    const { result } = renderHook(() => useRecentlyUploaded({ user: USER }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const call = getRecentUploadsMock.mock.calls[0]?.[0];
    expect(call).toMatchObject({ limit: 12 });
    expect(typeof call.addedAfter).toBe("string");
    expect(result.current.period).toBe("7d");
    expect(result.current.items).toHaveLength(2);
  });

  it("re-fetches with a wider addedAfter window when period flips to 30d", async () => {
    getRecentUploadsMock.mockResolvedValue([]);
    const { result } = renderHook(() => useRecentlyUploaded({ user: USER }));
    await waitFor(() => expect(getRecentUploadsMock).toHaveBeenCalledTimes(1));
    const first = getRecentUploadsMock.mock.calls[0]![0].addedAfter as string;

    await act(async () => {
      result.current.setPeriod("30d");
    });
    await waitFor(() => expect(getRecentUploadsMock).toHaveBeenCalledTimes(2));

    const second = getRecentUploadsMock.mock.calls[1]![0].addedAfter as string;
    expect(new Date(second).getTime()).toBeLessThan(new Date(first).getTime());
  });

  it("forwards the ownerFilter argument to the API call", async () => {
    getRecentUploadsMock.mockResolvedValueOnce([]);
    renderHook(() =>
      useRecentlyUploaded({ user: USER, ownerFilter: "user-2" })
    );
    await waitFor(() => expect(getRecentUploadsMock).toHaveBeenCalled());
    expect(getRecentUploadsMock.mock.calls[0]?.[0].owner).toBe("user-2");
  });
});
