/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BackupConfig, BackupEntry } from "../api";
import type { User } from "../types";
import { AdminBackupView } from "./AdminBackupView";

// ── Mock data ──────────────────────────────────────────────────────────

const adminUser: User = { id: "admin-1", username: "admin", email: "admin@test.local", role: "admin" };

function createBackup(overrides: Partial<BackupEntry> = {}): BackupEntry {
  return {
    id: "20260410_120000",
    createdAt: "2026-04-10T12:00:00Z",
    trigger: "manual",
    includesDatabase: true,
    includesIndex: true,
    sizeBytes: 1048576,
    files: ["backup.tar.gz"],
    ...overrides
  };
}

const defaultConfig: BackupConfig = {
  scheduledEnabled: true,
  intervalHours: 24,
  retentionDays: 30,
  includeIndex: true
};

// ── Hook mock ──────────────────────────────────────────────────────────

const mockCreateBackup = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDeleteBackup = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
const mockRestoreBackup = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
const mockUpdateConfig = vi.fn().mockResolvedValue(undefined);
const mockPurgeExpired = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRefreshBackups = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

let mockBackups: BackupEntry[] = [];
let mockLoadingBackups = false;
let mockConfig: BackupConfig | null = defaultConfig;
let mockLoadingConfig = false;
let mockError: string | null = null;
let mockMessage: string | null = null;
let mockCreating = false;
let mockRestoring = false;

vi.mock("../hooks/useAdminBackup", () => ({
  useAdminBackup: () => ({
    backups: mockBackups,
    loadingBackups: mockLoadingBackups,
    config: mockConfig,
    loadingConfig: mockLoadingConfig,
    backupError: mockError,
    backupMessage: mockMessage,
    creating: mockCreating,
    restoring: mockRestoring,
    onCreateBackup: mockCreateBackup,
    onDeleteBackup: mockDeleteBackup,
    onRestoreBackup: mockRestoreBackup,
    onUpdateConfig: mockUpdateConfig,
    onPurgeExpired: mockPurgeExpired,
    refreshBackups: mockRefreshBackups
  })
}));

function renderView(): void {
  render(<AdminBackupView currentUser={adminUser} />);
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("AdminBackupView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockBackups = [];
    mockLoadingBackups = false;
    mockConfig = defaultConfig;
    mockLoadingConfig = false;
    mockError = null;
    mockMessage = null;
    mockCreating = false;
    mockRestoring = false;
  });

  it("renders schedule status when config is loaded", () => {
    renderView();

    expect(screen.getByText("Backup schedule")).toBeTruthy();
    expect(screen.getByText("Automatic every 24h, 30-day retention")).toBeTruthy();
  });

  it("shows disabled status when scheduled backups are off", () => {
    mockConfig = { ...defaultConfig, scheduledEnabled: false };
    renderView();

    expect(screen.getByText("Automatic backups disabled")).toBeTruthy();
  });

  it("shows empty state when no backups exist", () => {
    renderView();

    expect(screen.getByText("No backups yet. Create one above.")).toBeTruthy();
  });

  it("renders backup entries with metadata", () => {
    mockBackups = [
      createBackup({ id: "20260410_120000", trigger: "manual" }),
      createBackup({ id: "20260409_060000", trigger: "scheduled", includesIndex: false })
    ];
    renderView();

    expect(screen.getByText("Backups (2)")).toBeTruthy();
    expect(screen.getByText("2026-04-10 12:00:00")).toBeTruthy();
    expect(screen.getByText("2026-04-09 06:00:00")).toBeTruthy();
  });

  it("calls onCreateBackup when Create button is clicked", () => {
    renderView();

    fireEvent.click(screen.getByText("Create backup now"));

    expect(mockCreateBackup).toHaveBeenCalledTimes(1);
  });

  it("calls onRefresh when Refresh button is clicked", () => {
    renderView();

    fireEvent.click(screen.getByText("Refresh"));

    expect(mockRefreshBackups).toHaveBeenCalledTimes(1);
  });

  it("calls onPurgeExpired when Purge button is clicked", () => {
    renderView();

    fireEvent.click(screen.getByText("Purge expired"));

    expect(mockPurgeExpired).toHaveBeenCalledTimes(1);
  });

  it("shows delete confirmation flow", () => {
    mockBackups = [createBackup()];
    renderView();

    fireEvent.click(screen.getByText("Delete"));
    expect(screen.getByText("Confirm delete")).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Confirm delete")).toBeNull();
  });

  it("calls onDeleteBackup after confirmation", () => {
    mockBackups = [createBackup({ id: "20260410_120000" })];
    renderView();

    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByText("Confirm delete"));

    expect(mockDeleteBackup).toHaveBeenCalledWith("20260410_120000");
  });

  it("shows restore confirmation flow", () => {
    mockBackups = [createBackup()];
    renderView();

    fireEvent.click(screen.getByText("Restore"));
    expect(screen.getByText("Confirm restore")).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Confirm restore")).toBeNull();
  });

  it("calls onRestoreBackup after confirmation", () => {
    mockBackups = [createBackup({ id: "20260410_120000" })];
    renderView();

    fireEvent.click(screen.getByText("Restore"));
    fireEvent.click(screen.getByText("Confirm restore"));

    expect(mockRestoreBackup).toHaveBeenCalledWith("20260410_120000");
  });

  it("displays error message when present", () => {
    mockError = "Backup storage full";
    renderView();

    expect(screen.getByRole("alert").textContent).toBe("Backup storage full");
  });

  it("displays success message when present", () => {
    mockMessage = "Backup created successfully.";
    renderView();

    expect(screen.getByRole("status").textContent).toBe("Backup created successfully.");
  });

  it("opens and cancels schedule editor", () => {
    renderView();

    fireEvent.click(screen.getByText("Configure"));

    expect(screen.getByText("Enable automatic backups")).toBeTruthy();
    expect(screen.getByText("Save")).toBeTruthy();

    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByText("Enable automatic backups")).toBeNull();
  });

  it("disables Create button while creating or restoring", () => {
    mockCreating = true;
    renderView();

    const createButton = screen.getByText("Creating backup...") as HTMLButtonElement;
    expect(createButton.disabled).toBe(true);
  });

  it("shows loading state when loading backups with empty list", () => {
    mockLoadingBackups = true;
    renderView();

    expect(screen.getByText("Loading backups...")).toBeTruthy();
  });
});
