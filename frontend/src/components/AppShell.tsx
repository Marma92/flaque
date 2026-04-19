import type { Dispatch, SetStateAction } from "react";

import type { Track, User } from "../types";
import { navigateTo, type ViewName } from "../utils/appUtils";
import { AccountView } from "./AccountView";
import { AdminBackupView } from "./AdminBackupView";
import { AdminLibraryView } from "./AdminLibraryView";
import { AdminServerView } from "./AdminServerView";
import { AdminUsersView } from "./AdminUsersView";
import { AudioPlayer } from "./AudioPlayer";
import { AppSidebar } from "./AppSidebar";
import { AppStatusBanners, type AppNotice } from "./AppStatusBanners";
import { ConfigView, type ConfigSection } from "./ConfigView";
import { LibraryWorkspace } from "./LibraryWorkspace";
import { PlayerShell } from "./PlayerShell";
import { UploadView } from "./UploadView";

type LibraryWorkspaceProps = Parameters<typeof LibraryWorkspace>[0];
type UploadViewProps = Parameters<typeof UploadView>[0];
type ConfigViewProps = Parameters<typeof ConfigView>[0];
type AudioPlayerBaseProps = Omit<Parameters<typeof AudioPlayer>[0], "expanded" | "onArtworkClick">;

type AppShellProps = {
  activeView: ViewName;
  user: User;
  setUser: Dispatch<SetStateAction<User | null>>;
  setActiveView: Dispatch<SetStateAction<ViewName>>;
  onViewChange: (view: ViewName) => void;
  onPlayerCollapse: () => void;
  onLogout: () => void;
  avatarUrl: string;
  appNotice: AppNotice | null;
  setAppNotice: Dispatch<SetStateAction<AppNotice | null>>;
  libraryError: string | null;
  loadingLibrary: boolean;
  libraryWorkspaceProps: LibraryWorkspaceProps;
  onLibrarySectionChange: (section: LibraryWorkspaceProps["activeLibrarySection"]) => void;
  uploadViewProps: UploadViewProps;
  configViewProps: ConfigViewProps;
  allTracksById: Map<string, Track>;
  setAvatarVersion: Dispatch<SetStateAction<number>>;
  notifyAuthStateChanged: (kind: "login" | "logout" | "session-change") => void;
  playerStatusMessage: string | null;
  audioPlayerProps: AudioPlayerBaseProps;
  onAutoPlaylistsRegenerated?: () => void;
};

/**
 * Main authenticated app layout and top-level view rendering.
 */
export function AppShell({
  activeView,
  user,
  setUser,
  setActiveView,
  onViewChange,
  onPlayerCollapse,
  onLogout,
  avatarUrl,
  appNotice,
  setAppNotice,
  libraryError,
  loadingLibrary,
  libraryWorkspaceProps,
  onLibrarySectionChange,
  uploadViewProps,
  configViewProps,
  allTracksById,
  setAvatarVersion,
  notifyAuthStateChanged,
  playerStatusMessage,
  audioPlayerProps,
  onAutoPlaylistsRegenerated
}: AppShellProps): JSX.Element {
  const shouldRenderPlayer = Boolean(audioPlayerProps.track) || activeView === "player";

  const sectionButtonClassName = (isActive: boolean): string =>
    `rounded-xl px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.08em] transition md:min-w-[6rem] md:px-2.5 md:text-[11px] md:tracking-[0.12em] ${
      isActive
        ? "bg-flaque-ink text-flaque-cream"
        : "border border-flaque-clay bg-white text-flaque-ink hover:bg-flaque-cream"
    }`;

  const configSections: Array<[ConfigSection, string]> = [
    ["index", "Index"], ["files", "Files"], ["users", "Users"], ["library", "Library"], ["server", "Server"], ["backup", "Backup"]
  ];

  const sectionSwitcher = activeView === "config" && user.role === "admin" ? (
    <>
      {configSections.map(([key, label]) => (
        <button
          key={key}
          className={sectionButtonClassName(configViewProps.activeSection === key)}
          type="button"
          onClick={() => { navigateTo("config", key); configViewProps.onSectionChange(key); }}
        >
          {label}
        </button>
      ))}
    </>
  ) : null;

  return (
    <main className="flex h-[100dvh] w-full flex-col overflow-hidden md:flex-row">
      <AppSidebar
        activeView={activeView}
        activeLibrarySection={libraryWorkspaceProps.activeLibrarySection}
        user={user}
        avatarUrl={avatarUrl}
        onViewChange={onViewChange}
        onLibrarySectionChange={onLibrarySectionChange}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {sectionSwitcher ? (
          <div className="flex flex-wrap items-center gap-1 border-b border-flaque-clay/60 bg-white/80 px-3 py-2 shadow-panel backdrop-blur-sm md:px-4 md:py-3">
            {sectionSwitcher}
          </div>
        ) : null}

        <AppStatusBanners
          appNotice={appNotice}
          libraryError={libraryError}
          showLibraryRefreshing={activeView === "library" && loadingLibrary}
        />

        {activeView === "library" ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <LibraryWorkspace {...libraryWorkspaceProps} />
          </div>
        ) : null}

        {activeView === "upload" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <UploadView {...uploadViewProps} />
          </div>
        ) : null}

        {activeView === "config" && user.role === "admin" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            {configViewProps.activeSection === "index" || configViewProps.activeSection === "files" ? (
              <ConfigView {...configViewProps} />
            ) : null}

            {configViewProps.activeSection === "users" ? (
              <AdminUsersView currentUser={user} setUser={setUser} setActiveView={setActiveView} />
            ) : null}

            {configViewProps.activeSection === "server" ? (
              <AdminServerView currentUser={user} />
            ) : null}

            {configViewProps.activeSection === "backup" ? (
              <AdminBackupView currentUser={user} />
            ) : null}

            {configViewProps.activeSection === "library" ? (
              <AdminLibraryView onAutoPlaylistsRegenerated={onAutoPlaylistsRegenerated} />
            ) : null}
          </div>
        ) : null}

        {activeView === "account" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AccountView
              user={user}
              setUser={setUser}
              avatarUrl={avatarUrl}
              allTracksById={allTracksById}
              setAppNotice={setAppNotice}
              setAvatarVersion={setAvatarVersion}
              notifyAuthStateChanged={notifyAuthStateChanged}
              onLogout={onLogout}
            />
          </div>
        ) : null}

        {shouldRenderPlayer ? (
          <PlayerShell
            activeView={activeView}
            playerStatusMessage={playerStatusMessage}
            onExpandPlayer={() => onViewChange("player")}
            onCollapsePlayer={onPlayerCollapse}
          >
            <AudioPlayer
              {...audioPlayerProps}
              expanded={activeView === "player"}
              onArtworkClick={activeView === "player" ? undefined : () => onViewChange("player")}
              onNavigateToLibrary={() => onViewChange("library")}
            />
          </PlayerShell>
        ) : null}
      </div>
    </main>
  );
}
