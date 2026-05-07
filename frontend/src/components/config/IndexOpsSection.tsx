import type { JSX } from "react";

type IndexOpsSectionProps = {
  loadingTracks: boolean;
  rebuilding: boolean;
  onRefreshTracks: () => Promise<void>;
  onRebuildIndex: () => Promise<void>;
};

export function IndexOpsSection({
  loadingTracks,
  rebuilding,
  onRefreshTracks,
  onRebuildIndex
}: IndexOpsSectionProps): JSX.Element {
  return (
    <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
      <h3 className="font-display text-xl text-flaque-ink">Index operations</h3>
      <p className="mt-2 text-sm text-flaque-steel">
        Keep the search index synchronized with the file system and refresh global file listings.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={() => { void onRefreshTracks(); }}
          disabled={loadingTracks}
        >
          {loadingTracks ? "Refreshing tracks..." : "Refresh files"}
        </button>
        <button
          className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={() => { void onRebuildIndex(); }}
          disabled={rebuilding}
        >
          {rebuilding ? "Rebuilding index..." : "Rebuild index"}
        </button>
      </div>
    </section>
  );
}
