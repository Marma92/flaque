import type { User } from "../types";
import type { ViewName } from "../utils/appUtils";
import { AudioPlayer } from "./AudioPlayer";
import { AppHeader } from "./AppHeader";
import { AppStatusBanners, type AppNotice } from "./AppStatusBanners";
import { ConfigView } from "./ConfigView";
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
  onViewChange: (view: ViewName) => void;
  onPlayerCollapse: () => void;
  onLogout: () => void;
  appNotice: AppNotice | null;
  libraryError: string | null;
  loadingLibrary: boolean;
  libraryWorkspaceProps: LibraryWorkspaceProps;
  uploadViewProps: UploadViewProps;
  configViewProps: ConfigViewProps;
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
  appNotice,
  libraryError,
  loadingLibrary,
  libraryWorkspaceProps,
  uploadViewProps,
  configViewProps,
  playerStatusMessage,
  audioPlayerProps
}: AppShellProps): JSX.Element {
  const hasStickyPlayer = Boolean(audioPlayerProps.track) && activeView !== "player";
  const shouldRenderPlayer = Boolean(audioPlayerProps.track) || activeView === "player";

  return (
    <main
      className={`mx-auto flex min-h-[100dvh] w-full max-w-7xl flex-col px-4 pt-6 md:px-6 ${
        hasStickyPlayer
          ? "pb-[calc(18rem+env(safe-area-inset-bottom))]"
          : activeView === "player"
            ? "pb-0"
            : "pb-[calc(2.5rem+env(safe-area-inset-bottom))]"
      }`}
    >
      <AppHeader activeView={activeView} user={user} onViewChange={onViewChange} onLogout={onLogout} />

      <AppStatusBanners
        appNotice={appNotice}
        libraryError={libraryError}
        showLibraryRefreshing={activeView === "library" && loadingLibrary}
      />

      {activeView === "library" ? <LibraryWorkspace {...libraryWorkspaceProps} /> : null}

      {activeView === "upload" ? <UploadView {...uploadViewProps} /> : null}

      {activeView === "config" && user.role === "admin" ? <ConfigView {...configViewProps} /> : null}

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
    </main>
  );
}
