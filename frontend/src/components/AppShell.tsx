import type { User } from "../types";
import type { ViewName } from "../utils/appUtils";
import { AccountView } from "./AccountView";
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
type AccountViewProps = Omit<Parameters<typeof AccountView>[0], "onLogout">;
type AudioPlayerBaseProps = Omit<Parameters<typeof AudioPlayer>[0], "expanded" | "onArtworkClick">;

type AppShellProps = {
  activeView: ViewName;
  user: User;
  onViewChange: (view: ViewName) => void;
  onPlayerCollapse: () => void;
  onLogout: () => void;
  avatarUrl: string;
  appNotice: AppNotice | null;
  libraryError: string | null;
  loadingLibrary: boolean;
  libraryWorkspaceProps: LibraryWorkspaceProps;
  uploadViewProps: UploadViewProps;
  configViewProps: ConfigViewProps;
  accountViewProps: AccountViewProps;
  playerStatusMessage: string | null;
  audioPlayerProps: AudioPlayerBaseProps;
};

/**
 * Main authenticated app layout and top-level view rendering.
 */
export function AppShell({
  activeView,
  user,
  onViewChange,
  onPlayerCollapse,
  onLogout,
  avatarUrl,
  appNotice,
  libraryError,
  loadingLibrary,
  libraryWorkspaceProps,
  uploadViewProps,
  configViewProps,
  accountViewProps,
  playerStatusMessage,
  audioPlayerProps
}: AppShellProps): JSX.Element {
  const hasStickyPlayer = Boolean(audioPlayerProps.track) && activeView !== "player";
  const shouldRenderPlayer = Boolean(audioPlayerProps.track) || activeView === "player";

  const sectionButtonClassName = (isActive: boolean): string =>
    `rounded-xl px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-[0.08em] transition md:min-w-[6rem] md:px-2.5 md:text-[11px] md:tracking-[0.12em] ${
      isActive
        ? "bg-flaque-ink text-flaque-cream"
        : "border border-flaque-clay bg-white text-flaque-ink hover:bg-flaque-cream"
    }`;

  const configSections: Array<[ConfigSection, string]> = [
    ["index", "Index"], ["files", "Files"], ["users", "Users"], ["server", "Server"]
  ];

  const sectionSwitcher = activeView === "config" && user.role === "admin" ? (
    <>
      {configSections.map(([key, label]) => (
        <button
          key={key}
          className={sectionButtonClassName(configViewProps.activeSection === key)}
          type="button"
          onClick={() => configViewProps.onSectionChange(key)}
        >
          {label}
        </button>
      ))}
    </>
  ) : null;

  return (
    <main
      className={`mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-4 pt-6 md:flex-row md:items-start md:gap-4 md:px-6 ${
        hasStickyPlayer
          ? "pb-[calc(18rem+env(safe-area-inset-bottom))]"
          : activeView === "player"
            ? "pb-0"
            : "pb-[calc(2.5rem+env(safe-area-inset-bottom))]"
      }`}
    >
      <AppSidebar
        activeView={activeView}
        activeLibrarySection={libraryWorkspaceProps.activeLibrarySection}
        user={user}
        avatarUrl={avatarUrl}
        onViewChange={onViewChange}
        onLibrarySectionChange={libraryWorkspaceProps.onSectionChange}
      />

      <div className="min-w-0 flex-1">
        {sectionSwitcher ? (
          <div className="mb-3 flex flex-wrap items-center gap-1 border border-flaque-clay/60 bg-white/80 px-3 py-2 shadow-panel backdrop-blur-sm md:px-4 md:py-3">
            {sectionSwitcher}
          </div>
        ) : null}

        <AppStatusBanners
          appNotice={appNotice}
          libraryError={libraryError}
          showLibraryRefreshing={activeView === "library" && loadingLibrary}
        />

        {activeView === "library" ? <LibraryWorkspace {...libraryWorkspaceProps} /> : null}

        {activeView === "upload" ? <UploadView {...uploadViewProps} /> : null}

        {activeView === "config" && user.role === "admin" ? <ConfigView {...configViewProps} /> : null}

        {activeView === "account" ? <AccountView {...accountViewProps} onLogout={onLogout} /> : null}

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
            />
          </PlayerShell>
        ) : null}
      </div>
    </main>
  );
}
