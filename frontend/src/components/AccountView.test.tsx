/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User, UserSession } from "../types";
import { AccountView } from "./AccountView";

function createSession(input: {
  id: string;
  current: boolean;
  label?: string;
  userAgent?: string;
  ipAddress?: string | null;
}): UserSession {
  const now = Date.now();
  return {
    id: input.id,
    userId: "user-1",
    createdAt: now - 10_000,
    expiresAt: now + 60_000,
    lastSeenAt: now,
    userAgent: input.userAgent ?? null,
    ipAddress: input.ipAddress ?? null,
    label: input.label ?? null,
    current: input.current
  };
}

function createUser(): User {
  return {
    id: "user-1",
    username: "alice",
    role: "user"
  };
}

describe("AccountView", () => {
  afterEach(() => {
    cleanup();
  });

  it("loads, displays and revokes a targeted session", async () => {
    const onListSessions = vi
      .fn<() => Promise<UserSession[]>>()
      .mockResolvedValue([
        createSession({ id: "session-current", current: true, label: "Laptop" }),
        createSession({ id: "session-other", current: false, label: "Phone" })
      ]);

    const onRevokeSession = vi.fn<(sessionId: string) => Promise<void>>().mockResolvedValue(undefined);

    render(
      <AccountView
        user={createUser()}
        avatarUrl="/api/users/me/photo"
        onUpdatePhoto={vi.fn().mockResolvedValue(undefined)}
        onChangePassword={vi.fn().mockResolvedValue(undefined)}
        onListSessions={onListSessions}
        onRevokeSession={onRevokeSession}
        onLogoutOtherSessions={vi.fn().mockResolvedValue(0)}
        onLogout={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(onListSessions).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Laptop")).toBeTruthy();
      expect(screen.getByText("Phone")).toBeTruthy();
      expect(screen.getByText("Current")).toBeTruthy();
    });

    const revokeButtons = screen.getAllByRole("button", { name: "Revoke" });
    expect(revokeButtons.length).toBe(2);

    fireEvent.click(revokeButtons[1]);

    await waitFor(() => {
      expect(onRevokeSession).toHaveBeenCalledWith("session-other");
      expect(onListSessions).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Session revoked.")).toBeTruthy();
    });
  });

  it("disables logout-others when no other sessions exist", async () => {
    const onListSessions = vi
      .fn<() => Promise<UserSession[]>>()
      .mockResolvedValue([createSession({ id: "session-current", current: true, label: "Laptop" })]);

    render(
      <AccountView
        user={createUser()}
        avatarUrl="/api/users/me/photo"
        onUpdatePhoto={vi.fn().mockResolvedValue(undefined)}
        onChangePassword={vi.fn().mockResolvedValue(undefined)}
        onListSessions={onListSessions}
        onRevokeSession={vi.fn().mockResolvedValue(undefined)}
        onLogoutOtherSessions={vi.fn().mockResolvedValue(0)}
        onLogout={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(onListSessions).toHaveBeenCalledTimes(1);
      const button = screen.getByRole("button", { name: "Logout other devices" }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    });
  });

  it("logs out other devices and refreshes sessions", async () => {
    const initialSessions = [
      createSession({ id: "session-current", current: true, label: "Laptop" }),
      createSession({ id: "session-other", current: false, label: "Tablet" })
    ];
    const postLogoutSessions = [createSession({ id: "session-current", current: true, label: "Laptop" })];

    const onListSessions = vi
      .fn<() => Promise<UserSession[]>>()
      .mockResolvedValueOnce(initialSessions)
      .mockResolvedValueOnce(postLogoutSessions);
    const onLogoutOtherSessions = vi.fn<() => Promise<number>>().mockResolvedValue(1);

    render(
      <AccountView
        user={createUser()}
        avatarUrl="/api/users/me/photo"
        onUpdatePhoto={vi.fn().mockResolvedValue(undefined)}
        onChangePassword={vi.fn().mockResolvedValue(undefined)}
        onListSessions={onListSessions}
        onRevokeSession={vi.fn().mockResolvedValue(undefined)}
        onLogoutOtherSessions={onLogoutOtherSessions}
        onLogout={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(onListSessions).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Logout other devices" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Logout other devices" }));

    await waitFor(() => {
      expect(onLogoutOtherSessions).toHaveBeenCalledTimes(1);
      expect(onListSessions).toHaveBeenCalledTimes(2);
      expect(screen.getByText("1 session logged out.")).toBeTruthy();
    });
  });
});
