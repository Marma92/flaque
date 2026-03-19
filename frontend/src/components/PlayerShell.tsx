import type { ReactNode } from "react";

import type { ViewName } from "../utils/appUtils";

type PlayerShellProps = {
  activeView: ViewName;
  playerStatusMessage: string | null;
  children: ReactNode;
};

/**
 * Layout wrapper for expanded/sticky player modes.
 */
export function PlayerShell({
  activeView,
  playerStatusMessage,
  children
}: PlayerShellProps): JSX.Element {
  return (
    <div
      className={
        activeView === "player"
          ? "flex min-h-0 flex-1 pb-[env(safe-area-inset-bottom)]"
          : "fixed bottom-0 left-0 right-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2"
      }
    >
      <div className={activeView === "player" ? "mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col" : "mx-auto max-w-7xl"}>
        {playerStatusMessage ? (
          <p className="mb-2 rounded-xl border border-flaque-clay/60 bg-white/85 px-3 py-2 text-sm text-flaque-steel" role="status">
            {playerStatusMessage}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
