import { Component, type ErrorInfo, type ReactNode } from "react";

import i18n from "../i18n";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

/**
 * Top-level boundary so a render/runtime error in any subtree shows a recover
 * screen instead of a blank white page. Strings are read from the i18n
 * singleton (not the hook) because a class component cannot use hooks; English
 * defaults keep the fallback readable even if the catalog failed to load.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No remote error sink yet; surface it in the console for local diagnosis.
    console.error("Uncaught error in React tree:", error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-flaque-cream p-6">
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl border border-flaque-clay bg-white p-8 text-center shadow-panel"
        >
          <h1 className="font-display text-xl font-semibold text-flaque-ink">
            {i18n.t("common:errorBoundary.title", { defaultValue: "Something went wrong" })}
          </h1>
          <p className="mt-3 text-sm text-flaque-steel">
            {i18n.t("common:errorBoundary.description", {
              defaultValue: "The app hit an unexpected error. You can try reloading the page."
            })}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black"
          >
            {i18n.t("common:errorBoundary.reload", { defaultValue: "Reload" })}
          </button>
        </div>
      </main>
    );
  }
}
