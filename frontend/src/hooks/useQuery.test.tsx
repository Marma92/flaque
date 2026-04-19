/* @vitest-environment happy-dom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useQuery } from "./useQuery";

describe("useQuery", () => {
  it("reports loading=true on first render and resolves data", async () => {
    const fetcher = vi.fn().mockResolvedValue([1, 2, 3]);
    const { result } = renderHook(() => useQuery(fetcher, [] as number[]));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([1, 2, 3]);
    expect(result.current.error).toBeNull();
  });

  it("surfaces errors and resets data to the initial value", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useQuery(fetcher, [] as number[]));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error?.message).toBe("boom");
    expect(result.current.data).toEqual([]);
  });

  it("refetches when refresh() is called", async () => {
    let callCount = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount += 1;
      return callCount;
    });

    const { result } = renderHook(() => useQuery(fetcher, 0));
    await waitFor(() => expect(result.current.data).toBe(1));

    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(result.current.data).toBe(2));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not fetch when enabled=false and returns the initial value", async () => {
    const fetcher = vi.fn().mockResolvedValue("should-not-be-used");
    const { result } = renderHook(() => useQuery(fetcher, "initial", { enabled: false }));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe("initial");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("ignores a stale response if a newer fetcher arrives before it resolves", async () => {
    let resolveFirst: (value: string) => void = () => {};
    const firstPromise = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const secondPromise = Promise.resolve("second");

    const fetcherV1 = vi.fn().mockReturnValueOnce(firstPromise);
    const fetcherV2 = vi.fn().mockReturnValueOnce(secondPromise);

    const { result, rerender } = renderHook(
      ({ fetcher }: { fetcher: () => Promise<string> }) => useQuery(fetcher, ""),
      { initialProps: { fetcher: fetcherV1 } }
    );

    rerender({ fetcher: fetcherV2 });
    await waitFor(() => expect(result.current.data).toBe("second"));

    await act(async () => {
      resolveFirst("first");
      await firstPromise;
    });

    expect(result.current.data).toBe("second");
  });

  it("lets callers mutate data locally via setData", async () => {
    const fetcher = vi.fn().mockResolvedValue([1, 2, 3]);
    const { result } = renderHook(() => useQuery(fetcher, [] as number[]));

    await waitFor(() => expect(result.current.data).toEqual([1, 2, 3]));

    act(() => {
      result.current.setData((prev) => prev.filter((n) => n !== 2));
    });

    expect(result.current.data).toEqual([1, 3]);
  });
});
