import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser, getMySessions, setUnauthorizedHandler } from "./api";

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
