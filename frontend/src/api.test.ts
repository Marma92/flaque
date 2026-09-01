import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser, getMySessions, setUnauthorizedHandler } from "./api";
import { requestJson } from "./api/client";

type MockResponseInit = {
  status: number;
  body?: unknown;
};

function mockFetchOnce({ status, body = {} }: MockResponseInit): void {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as unknown as Response);
}

beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
});

afterEach(() => {
  setUnauthorizedHandler(null);
  vi.restoreAllMocks();
});

describe("api unauthorized handler", () => {
  it("fires the handler on a 401 from a regular endpoint", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    mockFetchOnce({ status: 401, body: { error: "nope" } });

    await expect(getMySessions()).rejects.toThrow("nope");
    expect(handler).toHaveBeenCalledWith("/api/auth/sessions");
  });

  it("does not fire the handler for bypassed login-flow endpoints", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    mockFetchOnce({ status: 401, body: { error: "no session" } });

    const user = await getCurrentUser();
    expect(user).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does nothing when no handler is registered", async () => {
    setUnauthorizedHandler(null);
    mockFetchOnce({ status: 401, body: { error: "nope" } });
    await expect(getMySessions()).rejects.toThrow("nope");
  });

  it("only fires for 401s, not other error statuses", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    mockFetchOnce({ status: 500, body: { error: "server down" } });
    await expect(getMySessions()).rejects.toThrow("server down");
    expect(handler).not.toHaveBeenCalled();

    mockFetchOnce({ status: 403, body: { error: "forbidden" } });
    await expect(getMySessions()).rejects.toThrow("forbidden");
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("in-flight GET coalescing", () => {
  it("shares one round-trip between concurrent identical GETs", async () => {
    mockFetchOnce({ status: 200, body: { value: 42 } });

    const [first, second] = await Promise.all([
      requestJson<{ value: number }>("/api/library"),
      requestJson<{ value: number }>("/api/library")
    ]);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ value: 42 });
    // Same resolved object, which is why payloads must stay treated as immutable.
    expect(second).toBe(first);
  });

  it("does not cache: a later identical GET hits the network again", async () => {
    mockFetchOnce({ status: 200, body: { value: 1 } });
    await requestJson("/api/library");

    mockFetchOnce({ status: 200, body: { value: 2 } });
    const second = await requestJson("/api/library");

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(second).toEqual({ value: 2 });
  });

  it("keeps distinct paths independent", async () => {
    mockFetchOnce({ status: 200, body: { a: true } });
    mockFetchOnce({ status: 200, body: { b: true } });

    const [a, b] = await Promise.all([
      requestJson("/api/library"),
      requestJson("/api/artists")
    ]);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(a).toEqual({ a: true });
    expect(b).toEqual({ b: true });
  });

  it("never shares mutations", async () => {
    mockFetchOnce({ status: 200, body: { ok: 1 } });
    mockFetchOnce({ status: 200, body: { ok: 2 } });

    await Promise.all([
      requestJson("/api/radio/create", { method: "POST" }),
      requestJson("/api/radio/create", { method: "POST" })
    ]);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("releases the entry when the shared request fails", async () => {
    mockFetchOnce({ status: 500, body: { error: "boom" } });
    await expect(requestJson("/api/library")).rejects.toThrow("boom");

    // A failed request must not leave a poisoned entry behind.
    mockFetchOnce({ status: 200, body: { recovered: true } });
    await expect(requestJson("/api/library")).resolves.toEqual({ recovered: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
