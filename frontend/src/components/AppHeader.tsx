import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { User } from "../types";
import type { ViewName } from "../utils/appUtils";
import { Acronym } from "./HeaderAcronym";

type AppHeaderProps = {
  activeView: ViewName;
  user: User;
  avatarUrl: string;
  onViewChange: (view: ViewName) => void;
  children?: ReactNode;
};

/**
 * Top-level application header with branding and primary navigation.
 */
export function AppHeader({ activeView, user, avatarUrl, onViewChange, children }: AppHeaderProps): JSX.Element {
  const navIconButtonClassName = (isActive: boolean): string =>
    `flex h-11 w-11 items-center justify-center rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand/70 ${
      isActive
        ? "bg-flaque-ink/12 text-flaque-ink"
        : "text-flaque-steel hover:bg-flaque-cream/70 hover:text-flaque-ink"
    }`;

  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const userInitial = useMemo(() => {
    const trimmed = user.username.trim();
    return (trimmed[0] ?? "U").toUpperCase();
  }, [user.username]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl, user.id]);

  return (
    <header className="mb-2 rounded-3xl border border-flaque-clay/60 bg-white/80 px-3 py-2 shadow-panel backdrop-blur-sm md:px-4 md:py-3">
      <div className="flex flex-col items-center gap-2 md:flex-row md:justify-between md:gap-3">
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <button
            className="relative h-10 w-10 shrink-0 rounded-xl transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand md:h-14 md:w-14 md:rounded-2xl"
            type="button"
            aria-label="Go to library"
            title="Library"
            onClick={() => onViewChange("library")}
          >
            <img
              className="header-logo-light absolute inset-0 h-full w-full object-contain"
              src="/logo-light.png"
              alt="Flaque logo"
            />
            <img
              className="header-logo-dark absolute inset-0 h-full w-full object-contain"
              src="/logo-dark.png"
              alt="Flaque logo (dark mode)"
            />
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-base leading-tight text-flaque-ink md:text-lg">
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

        {children ? (
          <div className="order-last flex items-center justify-center gap-1 md:order-none md:flex-wrap md:gap-1.5">
            {children}
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            className={navIconButtonClassName(activeView === "library")}
            type="button"
            aria-label="Library"
            title="Library"
            onClick={() => onViewChange("library")}
          >
            <span className="relative block h-10 w-10" aria-hidden="true">
              <img className="nav-icon-light absolute inset-0 h-full w-full" src="/library-light.png" alt="" />
              <img className="nav-icon-dark absolute inset-0 h-full w-full" src="/library-dark.png" alt="" />
            </span>
          </button>

          <button
            className={navIconButtonClassName(activeView === "upload")}
            type="button"
            aria-label="Upload"
            title="Upload"
            onClick={() => onViewChange("upload")}
          >
            <span className="relative block h-10 w-10" aria-hidden="true">
              <img className="nav-icon-light absolute inset-0 h-full w-full" src="/upload-light.png" alt="" />
              <img className="nav-icon-dark absolute inset-0 h-full w-full" src="/upload-dark.png" alt="" />
            </span>
          </button>

          {user.role === "admin" ? (
            <button
              className={navIconButtonClassName(activeView === "config")}
              type="button"
              aria-label="Configuration"
              title="Configuration"
              onClick={() => onViewChange("config")}
            >
              <span className="relative block h-10 w-10" aria-hidden="true">
                <img className="nav-icon-light absolute inset-0 h-full w-full" src="/settings-light.png" alt="" />
                <img className="nav-icon-dark absolute inset-0 h-full w-full" src="/settings-dark.png" alt="" />
              </span>
            </button>
          ) : null}

          <button
            className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand/70 ${
              activeView === "account"
                ? "bg-flaque-ink/12 ring-1 ring-flaque-ink/30"
                : "bg-white text-flaque-steel hover:bg-flaque-cream/70"
            }`}
            type="button"
            aria-label="Account"
            title={user.username}
            onClick={() => onViewChange("account")}
          >
            {avatarLoadFailed ? (
              <span className="font-display text-sm text-flaque-ink">{userInitial}</span>
            ) : (
              <img
                className="h-full w-full object-cover"
                src={avatarUrl}
                alt={`${user.username} profile`}
                onError={() => {
                  setAvatarLoadFailed(true);
                }}
              />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
