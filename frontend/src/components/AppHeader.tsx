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
    `flex h-10 w-10 items-center justify-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand/70 ${
      isActive
        ? "bg-flaque-ink/12 text-flaque-ink"
        : "text-flaque-steel hover:bg-flaque-cream/70 hover:text-flaque-ink"
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

        <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
          <button
            className={navIconButtonClassName(activeView === "library")}
            type="button"
            aria-label="Library"
            title="Library"
            onClick={() => onViewChange("library")}
          >
            <svg
              className="h-7 w-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
              <circle cx="10.5" cy="12.5" r="5.2" />
              <circle cx="10.5" cy="12.5" r="2.2" />
              <circle cx="10.5" cy="12.5" r="0.9" />
              <path d="M15.8 7.7h2.8" />
              <path d="M18.6 7.7v4.3a1.5 1.5 0 01-.44 1.06l-1.26 1.26" />
              <path d="M16.6 14.3l1.1 1.1" />
            </svg>
          </button>

          <button
            className={navIconButtonClassName(activeView === "upload")}
            type="button"
            aria-label="Upload"
            title="Upload"
            onClick={() => onViewChange("upload")}
          >
            <svg
              className="h-7 w-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 16V6" />
              <path d="M8.8 9.2L12 6l3.2 3.2" />
              <path d="M5 16v2.2A1.8 1.8 0 006.8 20h10.4A1.8 1.8 0 0019 18.2V16" />
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
              <svg
                className="h-7 w-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="2.7" />
                <circle cx="12" cy="12" r="6.2" />
                <path d="M12 5.4v1.5" />
                <path d="M12 17.1v1.5" />
                <path d="M17.3 12h1.5" />
                <path d="M5.2 12h1.5" />
                <path d="M16.2 7.8l1.1-1.1" />
                <path d="M6.7 17.3l1.1-1.1" />
                <path d="M16.2 16.2l1.1 1.1" />
                <path d="M6.7 6.7l1.1 1.1" />
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
