/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LogEntry, StorageUsage, SystemStats, UpdateStatus, VersionInfo } from "../api";
import type { User } from "../types";
import type { SystemStatsDataPoint } from "../hooks/useAdminServer";
import { AdminServerView } from "./AdminServerView";

// ── Mock data ──────────────────────────────────────────────────────────

const adminUser: User = { id: "admin-1", username: "admin", email: "admin@test.local", role: "admin" };

const defaultVersionInfo: VersionInfo = {
  currentVersion: "0.3.0",
  latestVersion: null,
  isUpdateAvailable: false,
  releaseName: null,
  releaseUrl: null,
  checkedAt: Date.now()
};

const defaultSystemStats: SystemStats = {
  cpu: { usagePercent: 25.5, cores: 4, model: "Intel i7" },
  memory: { total: 16_000_000_000, used: 8_000_000_000, free: 8_000_000_000, usagePercent: 50.0 }
};

const defaultStorageUsage: StorageUsage = {
  disk: { total: 500_000_000_000, used: 200_000_000_000, free: 300_000_000_000 },
  directories: [
    { name: "Music", path: "/data/music", size: 150_000_000_000 },
    { name: "Database", path: "/data/db", size: 50_000_000_000 }
  ],
  totalDataSize: 200_000_000_000
};

const sampleLogEntries: LogEntry[] = [
  { level: 30, time: Date.now() - 60_000, msg: "Server started", context: "app" },
  { level: 40, time: Date.now() - 30_000, msg: "Slow query detected", context: "db" },
  { level: 50, time: Date.now(), msg: "Connection lost", context: "net" }
];

// ── Hook mock ──────────────────────────────────────────────────────────

let mockVersionInfo: VersionInfo | null = defaultVersionInfo;
let mockLoadingVersion = false;
let mockUpdateStatus: UpdateStatus | null = null;
let mockSystemStats: SystemStats | null = defaultSystemStats;
let mockSystemStatsHistory: SystemStatsDataPoint[] = [];
let mockLoadingSystemStats = false;
let mockStorageUsage: StorageUsage | null = defaultStorageUsage;
let mockLoadingStorage = false;
let mockLogFiles: Array<{ name: string; size: number }> = [{ name: "server.log", size: 10240 }];
let mockLoadingFiles = false;
let mockSelectedFile: string | null = "server.log";
let mockEntries: LogEntry[] = sampleLogEntries;
let mockLoadingEntries = false;
let mockServerError: string | null = null;
let mockTotal = 3;
let mockLevelFilter: number | null = null;
let mockHasMore = false;

const mockTriggerUpdate = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCheckForUpdates = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSetSelectedFile = vi.fn();
const mockSetLevelFilter = vi.fn();
const mockRefreshServer = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockLoadMore = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

vi.mock("../hooks/useAdminServer", () => ({
  useAdminServer: () => ({
    versionInfo: mockVersionInfo,
    loadingVersion: mockLoadingVersion,
    updateStatus: mockUpdateStatus,
    onTriggerUpdate: mockTriggerUpdate,
    onCheckForUpdates: mockCheckForUpdates,
    storageUsage: mockStorageUsage,
    loadingStorage: mockLoadingStorage,
    systemStats: mockSystemStats,
    systemStatsHistory: mockSystemStatsHistory,
    loadingSystemStats: mockLoadingSystemStats,
    logFiles: mockLogFiles,
    loadingFiles: mockLoadingFiles,
    selectedFile: mockSelectedFile,
    setSelectedFile: mockSetSelectedFile,
    entries: mockEntries,
    loadingEntries: mockLoadingEntries,
    serverError: mockServerError,
    total: mockTotal,
    levelFilter: mockLevelFilter,
    setLevelFilter: mockSetLevelFilter,
    refreshServer: mockRefreshServer,
    loadMore: mockLoadMore,
    hasMore: mockHasMore
  })
}));

function renderView(): void {
  render(<AdminServerView currentUser={adminUser} />);
}

function resetMocks(): void {
  mockVersionInfo = defaultVersionInfo;
  mockLoadingVersion = false;
  mockUpdateStatus = null;
  mockSystemStats = defaultSystemStats;
  mockSystemStatsHistory = [];
  mockLoadingSystemStats = false;
  mockStorageUsage = defaultStorageUsage;
  mockLoadingStorage = false;
  mockLogFiles = [{ name: "server.log", size: 10240 }];
  mockLoadingFiles = false;
  mockSelectedFile = "server.log";
  mockEntries = sampleLogEntries;
  mockLoadingEntries = false;
  mockServerError = null;
  mockTotal = 3;
  mockLevelFilter = null;
  mockHasMore = false;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("AdminServerView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    resetMocks();
  });

  // ── Version section ────────────────────────────────────────────────

  it("shows current version when up to date", () => {
    renderView();

    expect(screen.getByText(/Running v0\.3\.0/)).toBeTruthy();
  });

  it("shows update available banner", () => {
    mockVersionInfo = {
      ...defaultVersionInfo,
      isUpdateAvailable: true,
      latestVersion: "0.4.0"
    };
    renderView();

    expect(screen.getByText("Update available: v0.4.0")).toBeTruthy();
    expect(screen.getByText(/You are running v0\.3\.0/)).toBeTruthy();
    expect(screen.getByText("Update now")).toBeTruthy();
  });

  it("calls onTriggerUpdate when Update now is clicked", () => {
    mockVersionInfo = {
      ...defaultVersionInfo,
      isUpdateAvailable: true,
      latestVersion: "0.4.0"
    };
    renderView();

    fireEvent.click(screen.getByText("Update now"));

    expect(mockTriggerUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows updating status", () => {
    mockUpdateStatus = { status: "updating", message: "Pulling latest changes..." };
    renderView();

    expect(screen.getByText("Updating...")).toBeTruthy();
    expect(screen.getByText("Pulling latest changes...")).toBeTruthy();
  });

  it("shows update complete status", () => {
    mockUpdateStatus = { status: "complete", message: "Updated to v0.4.0" };
    renderView();

    expect(screen.getByText("Update complete")).toBeTruthy();
    expect(screen.getByText("Reload page")).toBeTruthy();
  });

  it("shows update failed status", () => {
    mockUpdateStatus = { status: "failed", message: "Git pull failed" };
    renderView();

    expect(screen.getByText("Update failed")).toBeTruthy();
    expect(screen.getByText("Git pull failed")).toBeTruthy();
  });

  it("calls onCheckForUpdates when Check button is clicked", () => {
    renderView();

    fireEvent.click(screen.getByText("Check for updates"));

    expect(mockCheckForUpdates).toHaveBeenCalledTimes(1);
  });

  // ── System stats section ───────────────────────────────────────────

  it("renders CPU and memory stats", () => {
    renderView();

    expect(screen.getByText("CPU")).toBeTruthy();
    expect(screen.getByText("Memory")).toBeTruthy();
    expect(screen.getByText(/25\.5%/)).toBeTruthy();
    expect(screen.getByText(/50\.0%/)).toBeTruthy();
  });

  it("shows loading state when system stats are unavailable", () => {
    mockSystemStats = null;
    mockLoadingSystemStats = true;
    renderView();

    expect(screen.getByText("System")).toBeTruthy();
    // The loading text appears inside the System section
    const systemSections = screen.getAllByText("Loading...");
    expect(systemSections.length).toBeGreaterThan(0);
  });

  it("shows unavailable message when stats are null after loading", () => {
    mockSystemStats = null;
    mockLoadingSystemStats = false;
    renderView();

    expect(screen.getByText("System stats unavailable.")).toBeTruthy();
  });

  // ── Storage section ────────────────────────────────────────────────

  it("renders storage information", () => {
    renderView();

    expect(screen.getByText("Storage")).toBeTruthy();
    expect(screen.getByText("Music")).toBeTruthy();
    expect(screen.getByText("Database")).toBeTruthy();
  });

  it("shows unavailable message when storage is null", () => {
    mockStorageUsage = null;
    mockLoadingStorage = false;
    renderView();

    expect(screen.getByText("Storage information unavailable.")).toBeTruthy();
  });

  // ── Logs section ───────────────────────────────────────────────────

  it("renders log entries with count", () => {
    renderView();

    expect(screen.getByText("Server logs")).toBeTruthy();
    expect(screen.getByText("3 / 3 entries")).toBeTruthy();
  });

  it("shows log messages", () => {
    renderView();

    expect(screen.getByText("Server started")).toBeTruthy();
    expect(screen.getByText("Slow query detected")).toBeTruthy();
    expect(screen.getByText("Connection lost")).toBeTruthy();
  });

  it("shows log level badges", () => {
    renderView();

    expect(screen.getByText("INFO")).toBeTruthy();
    expect(screen.getByText("WARN")).toBeTruthy();
    expect(screen.getByText("ERROR")).toBeTruthy();
  });

  it("shows empty state when no log entries", () => {
    mockEntries = [];
    mockTotal = 0;
    renderView();

    expect(screen.getByText("No log entries found.")).toBeTruthy();
  });

  it("calls refreshServer when Refresh is clicked", () => {
    renderView();

    fireEvent.click(screen.getByText("Refresh"));

    expect(mockRefreshServer).toHaveBeenCalledTimes(1);
  });

  it("shows Load more button when hasMore is true", () => {
    mockHasMore = true;
    renderView();

    const loadMoreButton = screen.getByText("Load more");
    expect(loadMoreButton).toBeTruthy();

    fireEvent.click(loadMoreButton);
    expect(mockLoadMore).toHaveBeenCalledTimes(1);
  });

  it("hides Load more button when hasMore is false", () => {
    mockHasMore = false;
    renderView();

    expect(screen.queryByText("Load more")).toBeNull();
  });

  it("displays server error when present", () => {
    mockServerError = "Connection timed out";
    renderView();

    expect(screen.getByText("Connection timed out")).toBeTruthy();
  });

  it("expands log entry details on click", () => {
    mockEntries = [{
      level: 30,
      time: Date.now(),
      msg: "Test entry",
      context: "test",
      customField: "extra-data"
    }];
    renderView();

    // Click the log entry to expand it
    fireEvent.click(screen.getByText("Test entry"));

    // Extra fields should be visible in a pre block
    expect(screen.getByText(/"customField": "extra-data"/)).toBeTruthy();
  });
});
