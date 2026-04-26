/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User, UserSession } from "../types";
import { AccountView } from "./AccountView";

const {
  mockHandleUpdateProfilePhoto,
  mockHandleUpdateEmail,
  mockHandleUpdateOwnPassword,
  mockHandleListMySessions,
  mockHandleRevokeMySession,
  mockHandleLogoutOtherSessions,
  mockGetMyPlayStats
} = vi.hoisted(() => ({
  mockHandleUpdateProfilePhoto: vi.fn().mockResolvedValue(undefined),
  mockHandleUpdateEmail: vi.fn().mockResolvedValue(undefined),
  mockHandleUpdateOwnPassword: vi.fn().mockResolvedValue(undefined),
  mockHandleListMySessions: vi.fn<() => Promise<UserSession[]>>(),
  mockHandleRevokeMySession: vi.fn<(sessionId: string) => Promise<void>>().mockResolvedValue(undefined),
  mockHandleLogoutOtherSessions: vi.fn<() => Promise<number>>(),
  mockGetMyPlayStats: vi.fn().mockResolvedValue({
    topTracks: [],
    topArtists: [],
    totalPlays: 0,
    uniqueTracksPlayed: 0
  })
}));

vi.mock("../api", () => ({
  coverUrl: (trackId: string, coverPath?: string) => coverPath ?? `/mock-covers/${trackId}`,
  getMyPlayStats: mockGetMyPlayStats
}));

vi.mock("../hooks/useAccountActions", () => ({
  useAccountActions: () => ({
    handleUpdateProfilePhoto: mockHandleUpdateProfilePhoto,
    handleUpdateEmail: mockHandleUpdateEmail,
    handleUpdateOwnPassword: mockHandleUpdateOwnPassword,
    handleListMySessions: mockHandleListMySessions,
    handleRevokeMySession: mockHandleRevokeMySession,
    handleLogoutOtherSessions: mockHandleLogoutOtherSessions
  })
}));

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
    email: "alice@test.local",
    role: "user"
  };
}

function renderAccountView(): void {
  render(
    <AccountView
      user={createUser()}
      setUser={vi.fn()}
      avatarUrl="/api/users/me/photo"
      allTracksById={new Map()}
      setAppNotice={vi.fn()}
      setAvatarVersion={vi.fn()}
      notifyAuthStateChanged={vi.fn()}
      onLogout={vi.fn()}
    />
  );
}

describe("AccountView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads, displays and revokes a targeted session", async () => {
    mockHandleListMySessions.mockResolvedValue([
      createSession({ id: "session-current", current: true, label: "Laptop" }),
      createSession({ id: "session-other", current: false, label: "Phone" })
    ]);

    renderAccountView();

    await waitFor(() => {
      expect(mockHandleListMySessions).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Laptop")).toBeTruthy();
      expect(screen.getByText("Phone")).toBeTruthy();
      expect(screen.getByText("Current")).toBeTruthy();
    });

    const revokeButtons = screen.getAllByRole("button", { name: "Revoke" });
    expect(revokeButtons.length).toBe(2);

    fireEvent.click(revokeButtons[1]);

    await waitFor(() => {
      expect(mockHandleRevokeMySession).toHaveBeenCalledWith("session-other");
      expect(mockHandleListMySessions).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Session revoked.")).toBeTruthy();
    });
  });

  it("disables logout-others when no other sessions exist", async () => {
    mockHandleListMySessions.mockResolvedValue([
      createSession({ id: "session-current", current: true, label: "Laptop" })
    ]);

    renderAccountView();

    await waitFor(() => {
      expect(mockHandleListMySessions).toHaveBeenCalledTimes(1);
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

    mockHandleListMySessions
      .mockResolvedValueOnce(initialSessions)
      .mockResolvedValueOnce(postLogoutSessions);
    mockHandleLogoutOtherSessions.mockResolvedValue(1);

    renderAccountView();

    await waitFor(() => {
      expect(mockHandleListMySessions).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Logout other devices" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Logout other devices" }));

    await waitFor(() => {
      expect(mockHandleLogoutOtherSessions).toHaveBeenCalledTimes(1);
      expect(mockHandleListMySessions).toHaveBeenCalledTimes(2);
      expect(screen.getByText("1 session logged out.")).toBeTruthy();
    });
  });
});
