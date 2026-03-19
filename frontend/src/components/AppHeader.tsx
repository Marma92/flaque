import type { User } from "../types";
import type { ViewName } from "../utils/appUtils";
import { Acronym } from "./HeaderAcronym";

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
            <h1 className="font-display text-base leading-tight text-flaque-ink sm:text-lg md:text-xl lg:text-2xl">
              <Acronym
                  text="FLAQUE"
                  expansions={{
                      F: "ile-based",
                      L: "ibrary",
                      A: "udio",
                      QU: "ery",
                      E: "ngine",
                  }}
              />
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
              viewBox="0 0 28 28"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="22" height="22" rx="3" />
              <circle cx="11" cy="15" r="6" />
              <circle cx="11" cy="15" r="2" />
              <circle cx="11" cy="15" r="0.9" />
              <path d="M18 8h4" />
              <path d="M22 8v6" />
              <path d="M22 14l-3 3" />
              <path d="M19 17l2 2" />
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
              viewBox="0 0 28 28"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 19V8" />
              <path d="M10 12l4-4 4 4" />
              <path d="M6 19v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
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
                viewBox="0 0 28 28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="14" cy="14" r="4" />
                <circle cx="14" cy="14" r="8" />
                <path d="M14 6V5" />
                <path d="M14 23v-1" />
                <path d="M22 14h1" />
                <path d="M6 14H5" />
                <path d="M20 8l1-1" />
                <path d="M8 20l-1 1" />
                <path d="M8 8L7 7" />
                <path d="M20 20l1 1" />
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
