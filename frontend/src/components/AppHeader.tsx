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
  const navIconButtonClassName = (isActive: boolean): string =>
    `flex h-10 w-10 items-center justify-center rounded-xl transition ${
      isActive
        ? "bg-flaque-ink text-flaque-cream"
        : "border border-flaque-clay bg-white text-flaque-ink hover:bg-flaque-cream"
    }`;

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

        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          <button
            className={navIconButtonClassName(activeView === "library")}
            type="button"
            aria-label="Library"
            title="Library"
            onClick={() => onViewChange("library")}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-5a3 3 0 00-6 0v5H4a1 1 0 01-1-1v-9.5z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M17 9.2v5.2a2.3 2.3 0 11-1.5-2.16V8.4L19 7.6v4.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            className={navIconButtonClassName(activeView === "upload")}
            type="button"
            aria-label="Upload"
            title="Upload"
            onClick={() => onViewChange("upload")}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 4v11" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 15.5v3a1.5 1.5 0 001.5 1.5h13a1.5 1.5 0 001.5-1.5v-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {user.role === "admin" ? (
            <button
              className={navIconButtonClassName(activeView === "config")}
              type="button"
              aria-label="Configuration"
              title="Configuration"
              onClick={() => onViewChange("config")}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" strokeLinecap="round" strokeLinejoin="round" />
                <path
                  d="M19.4 15a1.75 1.75 0 00.35 1.93l.04.04a2 2 0 11-2.83 2.83l-.04-.04A1.75 1.75 0 0015 19.4a1.75 1.75 0 00-1 .45 1.75 1.75 0 00-.5 1.34V21.5a2 2 0 11-4 0v-.06a1.75 1.75 0 00-.5-1.34A1.75 1.75 0 008 19.4a1.75 1.75 0 00-1.93.35l-.04.04a2 2 0 11-2.83-2.83l.04-.04A1.75 1.75 0 004.6 15a1.75 1.75 0 00-.45-1 1.75 1.75 0 00-1.34-.5H2.5a2 2 0 110-4h.06a1.75 1.75 0 001.34-.5A1.75 1.75 0 004.6 8a1.75 1.75 0 00-.35-1.93l-.04-.04a2 2 0 112.83-2.83l.04.04A1.75 1.75 0 008 4.6a1.75 1.75 0 001-.45 1.75 1.75 0 00.5-1.34V2.5a2 2 0 114 0v.06a1.75 1.75 0 00.5 1.34A1.75 1.75 0 0015 4.6a1.75 1.75 0 001.93-.35l.04-.04a2 2 0 112.83 2.83l-.04.04A1.75 1.75 0 0019.4 8c0 .38.14.74.45 1 .34.3.78.46 1.24.46h.41a2 2 0 110 4h-.06a1.75 1.75 0 00-1.34.5c-.3.26-.46.62-.46 1.04z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
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
