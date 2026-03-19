import type { ReactNode } from "react";

import type { ViewName } from "../utils/appUtils";

type PlayerShellProps = {
  activeView: ViewName;
  playerStatusMessage: string | null;
  onExpandPlayer: () => void;
  onCollapsePlayer: () => void;
  children: ReactNode;
};

/**
 * Layout wrapper for expanded/sticky player modes.
 */
export function PlayerShell({
  activeView,
  playerStatusMessage,
  onExpandPlayer,
  onCollapsePlayer,
  children
}: PlayerShellProps): JSX.Element {
  return (
    <div
        className={
          activeView === "player"
            ? "flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom)]"
            : "fixed bottom-0 left-0 right-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2"
        }
      >
      <div
        className={
          activeView === "player"
            ? "relative mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col"
            : "mx-auto max-w-7xl"
        }
      >
        {playerStatusMessage ? (
          <p className="mb-2 rounded-xl border border-flaque-clay/60 bg-white/85 px-3 py-2 text-sm text-flaque-steel" role="status">
            {playerStatusMessage}
          </p>
        ) : null}

        <div className={activeView === "player" ? "" : "relative"}>
          {children}

          {activeView !== "player" ? (
            <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
              <button
                className="pointer-events-auto flex h-8 w-10 items-center justify-center rounded-full border border-flaque-clay/60 bg-white/90 text-flaque-steel transition hover:bg-flaque-cream"
                type="button"
                aria-label="Expand player"
                title="Expand player"
                onClick={onExpandPlayer}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 14l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {activeView === "player" ? (
        <div className="mt-2 flex justify-center">
          <button
            className="flex h-8 w-12 items-center justify-center rounded-full border border-flaque-clay/70 bg-white/90 text-flaque-steel transition hover:bg-flaque-cream"
            type="button"
            aria-label="Collapse player"
            title="Collapse player"
            onClick={onCollapsePlayer}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 10l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
