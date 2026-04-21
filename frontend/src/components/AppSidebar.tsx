import { useEffect, useMemo, useState } from "react";

import type { User } from "../types";
import type { LibrarySection } from "../types/library";
import { navigateTo, type ViewName } from "../utils/appUtils";
import { Acronym } from "./HeaderAcronym";

type AppSidebarProps = {
  activeView: ViewName;
  activeLibrarySection: LibrarySection;
  user: User;
  avatarUrl: string;
  onViewChange: (view: ViewName) => void;
  onLibrarySectionChange: (section: LibrarySection) => void;
};

const LIBRARY_ITEMS: Array<{ key: LibrarySection; label: string }> = [
  { key: "home", label: "Home" },
  { key: "music", label: "Library" },
  { key: "artists", label: "Artists" },
  { key: "albums", label: "Albums" },
  { key: "playlists", label: "Playlists" }
];

const THEME_STORAGE_KEY = "flaque_theme_v1";

export function AppSidebar({
  activeView,
  activeLibrarySection,
  user,
  avatarUrl,
  onViewChange,
  onLibrarySectionChange
}: AppSidebarProps): JSX.Element {
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const userInitial = useMemo(() => {
    const trimmed = user.username.trim();
    return (trimmed[0] ?? "U").toUpperCase();
  }, [user.username]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl, user.id]);

  useEffect(() => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    if (currentTheme === "dark" || currentTheme === "light") {
      setTheme(currentTheme);
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  const sidebarButtonClassName = (isActive: boolean): string =>
    `flex w-full items-center justify-between rounded-xl px-1 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand/70 lg:px-3 ${
      isActive
        ? "bg-flaque-ink text-flaque-cream"
        : "text-flaque-ink hover:bg-flaque-cream/80"
    }`;

  const handleLibraryEntryClick = (section: LibrarySection): void => {
    navigateTo("library", section);
    onViewChange("library");
    onLibrarySectionChange(section);
    setMobileMenuOpen(false);
  };

  const handleViewEntryClick = (view: ViewName): void => {
    navigateTo(view);
    onViewChange(view);
    setMobileMenuOpen(false);
  };

  const handleThemeToggle = (): void => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  };

  const themeToggleLabel = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <>
      <div className="flex items-center justify-start border-b border-flaque-clay/60 bg-white/80 px-3 py-2 shadow-panel backdrop-blur-sm md:hidden">
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-flaque-clay/70 bg-white/80 text-flaque-ink transition hover:bg-flaque-cream/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand"
          type="button"
          aria-label="Open menu"
          onClick={() => setMobileMenuOpen(true)}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            className="absolute inset-0 bg-flaque-ink/45"
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-[min(86vw,22rem)] border-r border-flaque-clay/70 bg-white/95 shadow-2xl backdrop-blur-md">
            <div className="flex h-full flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <span className="font-display text-sm uppercase tracking-[0.12em] text-flaque-steel">Navigation</span>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-flaque-clay/70 bg-white text-flaque-ink transition hover:bg-flaque-cream/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand"
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <button
                className="flex w-full items-center gap-3 p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand"
                type="button"
                aria-label="Go to home"
                title="Home"
                onClick={() => handleLibraryEntryClick("home")}
              >
                <span className="relative h-12 w-12 shrink-0 overflow-hidden">
                  <img className="header-logo-light absolute inset-0 h-full w-full object-contain" src="/logo-light.png" alt="Flaque logo" />
                  <img className="header-logo-dark absolute inset-0 h-full w-full object-contain" src="/logo-dark.png" alt="Flaque logo (dark mode)" />
                </span>
                <span className="min-w-0 font-display text-sm leading-tight text-flaque-ink">
                  <Acronym
                    text="FLAQUE"
                    expansions={{
                      F: "ile-based",
                      L: "ibrary",
                      A: "udio",
                      QU: "ery",
                      E: "ngine"
                    }}
                  />
                </span>
              </button>

              <nav className="border rounded-xl border-flaque-clay/50 bg-white/70 p-2" aria-label="Music navigation">
                <ul className="space-y-1">
                  {LIBRARY_ITEMS.map((item) => {
                    const isActive = activeView === "library" && activeLibrarySection === item.key;
                    return (
                      <li key={item.key}>
                        <button
                          className={sidebarButtonClassName(isActive)}
                          type="button"
                          onClick={() => handleLibraryEntryClick(item.key)}
                        >
                          <span>{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="mt-auto space-y-1 border-t border-flaque-clay/60 pt-3">
                {user.role === "admin" ? (
                  <button
                    className={sidebarButtonClassName(activeView === "config")}
                    type="button"
                    onClick={() => handleViewEntryClick("config")}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="relative block h-5 w-5" aria-hidden="true">
                        <img className="nav-icon-light absolute inset-0 h-full w-full" src="/settings-light.png" alt="" />
                        <img className="nav-icon-dark absolute inset-0 h-full w-full" src="/settings-dark.png" alt="" />
                      </span>
                      <span>Settings</span>
                    </span>
                  </button>
                ) : null}

                <button
                  className={sidebarButtonClassName(activeView === "upload")}
                  type="button"
                  onClick={() => handleViewEntryClick("upload")}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="relative block h-5 w-5" aria-hidden="true">
                      <img className="nav-icon-light absolute inset-0 h-full w-full" src="/upload-light.png" alt="" />
                      <img className="nav-icon-dark absolute inset-0 h-full w-full" src="/upload-dark.png" alt="" />
                    </span>
                    <span>Upload</span>
                  </span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    className={`${sidebarButtonClassName(activeView === "account")} flex-1`}
                    type="button"
                    onClick={() => handleViewEntryClick("account")}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-flaque-clay/60 bg-white">
                        {avatarLoadFailed ? (
                          <span className="font-display text-[11px] text-flaque-ink">{userInitial}</span>
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
                      </span>
                      <span>Account</span>
                    </span>
                  </button>
                  <button
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-flaque-clay/70 bg-white/80 text-flaque-ink transition hover:bg-flaque-cream/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand"
                    type="button"
                    aria-label={themeToggleLabel}
                    title={themeToggleLabel}
                    onClick={handleThemeToggle}
                  >
                    {theme === "dark" ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      <aside className="hidden border-r border-flaque-clay/60 bg-white/80 shadow-panel backdrop-blur-sm md:sticky md:top-0 md:block md:h-[100dvh] md:w-36 md:shrink-0 lg:w-72">
        <div className="flex h-full flex-col gap-3 px-1 py-4 lg:p-4">
          <button
            className="flex w-full flex-col items-center gap-0 p-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand lg:flex-row lg:gap-3 lg:text-left"
            type="button"
            aria-label="Go to home"
            title="Home"
            onClick={() => handleLibraryEntryClick("home")}
          >
            <span className="relative h-12 w-12 shrink-0 overflow-hidden">
              <img className="header-logo-light absolute inset-0 h-full w-full object-contain" src="/logo-light.png" alt="Flaque logo" />
              <img className="header-logo-dark absolute inset-0 h-full w-full object-contain" src="/logo-dark.png" alt="Flaque logo (dark mode)" />
            </span>
            <span className="min-w-0 font-display text-sm leading-tight text-flaque-ink">
              <Acronym
                text="FLAQUE"
                expansions={{
                  F: "ile-based",
                  L: "ibrary",
                  A: "udio",
                  QU: "ery",
                  E: "ngine"
                }}
              />
            </span>
          </button>

          <nav className="border rounded-xl border-flaque-clay/50 bg-white/70 px-1 py-2 lg:p-2" aria-label="Music navigation">
            <ul className="space-y-1">
              {LIBRARY_ITEMS.map((item) => {
                const isActive = activeView === "library" && activeLibrarySection === item.key;
                return (
                  <li key={item.key}>
                    <button
                      className={sidebarButtonClassName(isActive)}
                      type="button"
                      onClick={() => handleLibraryEntryClick(item.key)}
                    >
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-auto space-y-1 border-t border-flaque-clay/60 pt-3">
            {user.role === "admin" ? (
              <button
                className={sidebarButtonClassName(activeView === "config")}
                type="button"
                onClick={() => handleViewEntryClick("config")}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="relative block h-5 w-5" aria-hidden="true">
                    <img className="nav-icon-light absolute inset-0 h-full w-full" src="/settings-light.png" alt="" />
                    <img className="nav-icon-dark absolute inset-0 h-full w-full" src="/settings-dark.png" alt="" />
                  </span>
                  <span>Settings</span>
                </span>
              </button>
            ) : null}

            <button
              className={sidebarButtonClassName(activeView === "upload")}
              type="button"
              onClick={() => handleViewEntryClick("upload")}
            >
              <span className="inline-flex items-center gap-2">
                <span className="relative block h-5 w-5" aria-hidden="true">
                  <img className="nav-icon-light absolute inset-0 h-full w-full" src="/upload-light.png" alt="" />
                  <img className="nav-icon-dark absolute inset-0 h-full w-full" src="/upload-dark.png" alt="" />
                </span>
                <span>Upload</span>
              </span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                className={`${sidebarButtonClassName(activeView === "account")} flex-1`}
                type="button"
                onClick={() => handleViewEntryClick("account")}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-flaque-clay/60 bg-white">
                    {avatarLoadFailed ? (
                      <span className="font-display text-[11px] text-flaque-ink">{userInitial}</span>
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
                  </span>
                  <span>Account</span>
                </span>
              </button>
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-flaque-clay/70 bg-white/80 text-flaque-ink transition hover:bg-flaque-cream/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand"
                type="button"
                aria-label={themeToggleLabel}
                title={themeToggleLabel}
                onClick={handleThemeToggle}
              >
                {theme === "dark" ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
