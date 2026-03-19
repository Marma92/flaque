import type { User } from "../types";
import type { ViewName } from "../utils/appUtils";

type AppHeaderProps = {
  activeView: ViewName;
  user: User;
  onViewChange: (view: ViewName) => void;
  onLogout: () => void;
};

/**
 * Top-level application header with branding and primary navigation.
 */
export function AppHeader({ activeView, user, onViewChange, onLogout }: AppHeaderProps): JSX.Element {
  return (
    <header className="mb-4 rounded-3xl border border-flaque-clay/60 bg-white/80 px-5 py-4 shadow-panel backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <button
            className="relative h-20 w-20 shrink-0 rounded-2xl transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand md:h-24 md:w-24"
            type="button"
            aria-label="Go to library"
            title="Library"
            onClick={() => onViewChange("library")}
          >
            <img
              className="header-logo-light absolute inset-0 h-full w-full object-contain"
              src="/favicon.png"
              alt="Flaque logo"
            />
            <img
              className="header-logo-dark absolute inset-0 h-full w-full object-contain"
              src="/logo-dark.png"
              alt="Flaque logo (dark mode)"
            />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-flaque-steel sm:text-xs">
              File-based Library
            </p>
            <h1 className="font-display text-sm leading-tight text-flaque-ink sm:text-base md:text-lg">
              Audio Query Engine
            </h1>
          </div>
        </div>

        <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 pr-10 sm:w-auto sm:flex-wrap sm:overflow-visible sm:pb-0 sm:pr-0">
          <button
            className={`rounded-xl px-4 py-2 text-sm transition ${
              activeView === "library"
                ? "bg-flaque-ink text-flaque-cream"
                : "border border-flaque-clay bg-white text-flaque-ink"
            }`}
            type="button"
            onClick={() => onViewChange("library")}
          >
            Library
          </button>
          <button
            className={`rounded-xl px-4 py-2 text-sm transition ${
              activeView === "upload"
                ? "bg-flaque-ink text-flaque-cream"
                : "border border-flaque-clay bg-white text-flaque-ink"
            }`}
            type="button"
            onClick={() => onViewChange("upload")}
          >
            Upload
          </button>
          <button
            className={`rounded-xl px-4 py-2 text-sm transition ${
              activeView === "player"
                ? "bg-flaque-ink text-flaque-cream"
                : "border border-flaque-clay bg-white text-flaque-ink"
            }`}
            type="button"
            onClick={() => onViewChange("player")}
          >
            Player
          </button>
          {user.role === "admin" ? (
            <button
              className={`rounded-xl px-4 py-2 text-sm transition ${
                activeView === "config"
                  ? "bg-flaque-ink text-flaque-cream"
                  : "border border-flaque-clay bg-white text-flaque-ink"
              }`}
              type="button"
              onClick={() => onViewChange("config")}
            >
              Config
            </button>
          ) : null}

          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream"
            type="button"
            onClick={onLogout}
          >
            Logout ({user.username})
          </button>
        </div>
      </div>
    </header>
  );
}
