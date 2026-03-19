export type AppNoticeTone = "success" | "error" | "info";

export type AppNotice = {
  tone: AppNoticeTone;
  message: string;
};

type AppStatusBannersProps = {
  appNotice: AppNotice | null;
  libraryError: string | null;
  showLibraryRefreshing: boolean;
};

/**
 * Shared status banners displayed at the top of the app shell.
 */
export function AppStatusBanners({
  appNotice,
  libraryError,
  showLibraryRefreshing
}: AppStatusBannersProps): JSX.Element {
  return (
    <>
      {appNotice ? (
        <div
          className={`mb-4 rounded-xl border px-3 py-2 text-sm ${
            appNotice.tone === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : appNotice.tone === "error"
                ? "border-red-300 bg-red-50 text-red-700"
                : "border-flaque-clay bg-flaque-cream/70 text-flaque-steel"
          }`}
          role="status"
          aria-live="polite"
        >
          {appNotice.message}
        </div>
      ) : null}

      {libraryError ? (
        <p className="mb-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{libraryError}</p>
      ) : null}

      {showLibraryRefreshing ? <p className="mb-4 text-sm text-flaque-steel">Refreshing library index...</p> : null}
    </>
  );
}
