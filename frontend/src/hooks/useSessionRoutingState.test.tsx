/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "../types";
import { useSessionRoutingState } from "./useSessionRoutingState";

const { getCurrentUserMock, loginMock } = vi.hoisted(() => {
  return {
    getCurrentUserMock: vi.fn<() => Promise<User | null>>(),
    loginMock: vi.fn<(username: string, password: string) => Promise<User>>()
  };
});

vi.mock("../api", () => {
  return {
    getCurrentUser: getCurrentUserMock,
    login: loginMock
  };
});

type BroadcastPayload = {
  sourceId: string;
  kind: "login" | "logout" | "session-change";
  at: number;
};

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];

  name: string;
  onmessage: ((event: MessageEvent<BroadcastPayload>) => void) | null = null;
  postMessage: ReturnType<typeof vi.fn>;

  constructor(name: string) {
    this.name = name;
    this.postMessage = vi.fn();
    MockBroadcastChannel.instances.push(this);
  }

  close(): void {
    MockBroadcastChannel.instances = MockBroadcastChannel.instances.filter((instance) => instance !== this);
  }

  emit(data: BroadcastPayload): void {
    this.onmessage?.({ data } as MessageEvent<BroadcastPayload>);
  }

  static reset(): void {
    MockBroadcastChannel.instances = [];
  }
}

function HookProbe(): JSX.Element {
  const state = useSessionRoutingState();

  return (
    <div>
      <p data-testid="session-checked">{state.sessionChecked ? "yes" : "no"}</p>
      <p data-testid="user">{state.user?.username ?? "none"}</p>
      <button type="button" onClick={() => state.notifyAuthStateChanged("session-change")}>
        Notify
      </button>
      <button
        type="button"
        onClick={() => {
          void state.handleLogin("alice", "password");
        }}
      >
        Login
      </button>
    </div>
  );
}

function createUser(username: string): User {
  return {
    id: `${username}-id`,
    username,
    role: "user"
  };
}

describe("useSessionRoutingState", () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;

  beforeEach(() => {
    vi.clearAllMocks();
    MockBroadcastChannel.reset();
    globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;
  });

  afterEach(() => {
    cleanup();
    globalThis.BroadcastChannel = originalBroadcastChannel;
  });

  it("bootstraps current session on mount", async () => {
    getCurrentUserMock.mockResolvedValue(createUser("alice"));

    render(<HookProbe />);

    await waitFor(() => {
      expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("session-checked").textContent).toBe("yes");
      expect(screen.getByTestId("user").textContent).toBe("alice");
    });
  });

  it("refreshes session when receiving a broadcast event from another tab", async () => {
    getCurrentUserMock.mockResolvedValueOnce(createUser("alice")).mockResolvedValueOnce(null);

    render(<HookProbe />);

    await waitFor(() => {
      expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
      expect(MockBroadcastChannel.instances.length).toBe(1);
      expect(screen.getByTestId("user").textContent).toBe("alice");
    });

    const channel = MockBroadcastChannel.instances[0];
    channel.emit({
      sourceId: "other-tab",
      kind: "logout",
      at: Date.now()
    });

    await waitFor(() => {
      expect(getCurrentUserMock).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("user").textContent).toBe("none");
    });
  });

  it("broadcasts session updates and login events", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    loginMock.mockResolvedValue(createUser("alice"));

    render(<HookProbe />);

    await waitFor(() => {
      expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
      expect(MockBroadcastChannel.instances.length).toBe(1);
    });

    const channel = MockBroadcastChannel.instances[0];

    fireEvent.click(screen.getByRole("button", { name: "Notify" }));
    await waitFor(() => {
      expect(channel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "session-change",
          sourceId: expect.any(String),
          at: expect.any(Number)
        })
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith("alice", "password");
      expect(screen.getByTestId("user").textContent).toBe("alice");
      expect(channel.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "login",
          sourceId: expect.any(String),
          at: expect.any(Number)
        })
      );
    });
  });

  it("falls back to storage events when BroadcastChannel is unavailable", async () => {
    globalThis.BroadcastChannel = undefined as unknown as typeof BroadcastChannel;
    getCurrentUserMock.mockResolvedValueOnce(createUser("alice")).mockResolvedValueOnce(null);

    render(<HookProbe />);

    await waitFor(() => {
      expect(getCurrentUserMock).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("user").textContent).toBe("alice");
    });

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "flaque_auth_sync_v1",
        newValue: JSON.stringify({
          sourceId: "other-tab",
          kind: "logout",
          at: Date.now()
        })
      })
    );

    await waitFor(() => {
      expect(getCurrentUserMock).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("user").textContent).toBe("none");
    });
  });
});
