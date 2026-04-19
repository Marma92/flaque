/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "../types";
import { AdminUsersView } from "./AdminUsersView";

// ── Mock data ──────────────────────────────────────────────────────────

const adminUser: User = { id: "admin-1", username: "admin", email: "admin@test.local", role: "admin" };
const regularUser: User = { id: "user-2", username: "bob", email: "bob@test.local", role: "user" };
const otherAdmin: User = { id: "admin-3", username: "carol", email: "carol@test.local", role: "admin" };

// ── Hook mocks ─────────────────────────────────────────────────────────

const mockRefreshAdminUsers = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockClearAdminState = vi.fn();

const mockCreateUser = vi.fn<(input: { username: string; password: string; email: string; role: string }) => Promise<void>>().mockResolvedValue(undefined);
const mockPatchUser = vi.fn().mockResolvedValue(undefined);
const mockDeleteUser = vi.fn<(userId: string) => Promise<void>>().mockResolvedValue(undefined);
const mockResetPassword = vi.fn().mockResolvedValue(undefined);

let mockUsers: User[] = [adminUser, regularUser, otherAdmin];
let mockLoading = false;
let mockError: string | null = null;

vi.mock("../hooks/useAdminUsers", () => ({
  useAdminUsers: () => ({
    adminUsers: mockUsers,
    loadingAdminUsers: mockLoading,
    adminError: mockError,
    refreshAdminUsers: mockRefreshAdminUsers,
    clearAdminState: mockClearAdminState
  })
}));

vi.mock("../hooks/useAdminCommands", () => ({
  useAdminCommands: () => ({
    handleCreateUser: mockCreateUser,
    handlePatchUser: mockPatchUser,
    handleDeleteUser: mockDeleteUser,
    handleResetUserPassword: mockResetPassword
  })
}));

function renderView(): void {
  render(
    <AdminUsersView
      currentUser={adminUser}
      setUser={vi.fn()}
      setActiveView={vi.fn()}
    />
  );
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("AdminUsersView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockUsers = [adminUser, regularUser, otherAdmin];
    mockLoading = false;
    mockError = null;
  });

  it("renders user list with correct counts", () => {
    renderView();

    expect(screen.getByText("Showing 3 / 3 users.")).toBeTruthy();
    expect(screen.getByText("User Management")).toBeTruthy();
  });

  it("filters users by search text", () => {
    renderView();

    const searchInput = screen.getByPlaceholderText("Search by username or user id");
    fireEvent.change(searchInput, { target: { value: "bob" } });

    expect(screen.getByText("Showing 1 / 3 users.")).toBeTruthy();
  });

  it("filters users by role", () => {
    renderView();

    const roleSelect = screen.getByDisplayValue("all roles");
    fireEvent.change(roleSelect, { target: { value: "admin" } });

    expect(screen.getByText("Showing 2 / 3 users.")).toBeTruthy();
  });

  it("shows empty result when search matches nothing", () => {
    renderView();

    const searchInput = screen.getByPlaceholderText("Search by username or user id");
    fireEvent.change(searchInput, { target: { value: "nonexistent-xyz" } });

    expect(screen.getByText("Showing 0 / 3 users.")).toBeTruthy();
  });

  it("creates a new user via the form", async () => {
    renderView();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "newuser" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@test.local" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });

    fireEvent.submit(screen.getByText("Create user").closest("form")!);

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith({
        username: "newuser",
        password: "password123",
        email: "new@test.local",
        role: "user"
      });
      expect(screen.getByText("User created successfully.")).toBeTruthy();
    });
  });

  it("shows error when user creation fails", async () => {
    mockCreateUser.mockRejectedValueOnce(new Error("Username already taken"));
    renderView();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "duplicate" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "dup@test.local" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });

    fireEvent.submit(screen.getByText("Create user").closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Username already taken")).toBeTruthy();
    });
  });

  it("calls refresh when Refresh users button is clicked", async () => {
    renderView();

    fireEvent.click(screen.getByText("Refresh users"));

    await waitFor(() => {
      expect(mockRefreshAdminUsers).toHaveBeenCalledTimes(1);
    });
  });

  it("displays admin error when present", () => {
    mockError = "Failed to load users";
    renderView();

    expect(screen.getByText("Failed to load users")).toBeTruthy();
  });

  it("prevents deleting own account", () => {
    renderView();

    // The mobile card view shows "Current session" for the admin's own Delete button
    const currentSessionButtons = screen.getAllByText("Current session");
    expect(currentSessionButtons.length).toBeGreaterThan(0);
  });
});
