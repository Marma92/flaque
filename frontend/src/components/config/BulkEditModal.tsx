import type { Dispatch, FormEvent, JSX, SetStateAction } from "react";

export type BulkEditState = {
  trackIds: string[];
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  commonTitle: string | undefined;
  commonArtist: string | undefined;
  commonAlbum: string | undefined;
  commonYear: string | undefined;
  commonGenre: string | undefined;
};

type BulkEditModalProps = {
  state: BulkEditState;
  saving: boolean;
  onChange: Dispatch<SetStateAction<BulkEditState | null>>;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
};

export function BulkEditModal({
  state,
  saving,
  onChange,
  onSubmit,
  onCancel
}: BulkEditModalProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <form
        className="w-full max-w-md rounded-3xl border border-flaque-clay/60 bg-white p-5 shadow-panel"
        onSubmit={onSubmit}
      >
        <h3 className="font-display text-xl text-flaque-ink">Edit {state.trackIds.length} tracks</h3>
        <p className="mt-2 text-sm text-flaque-steel">
          Only fields you change will be updated. Unchanged fields keep their current values.
        </p>

        <label className="mt-4 block text-sm text-flaque-ink">
          Title
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            value={state.title}
            placeholder={state.commonTitle === undefined ? "Mixed values" : ""}
            onChange={(e) => onChange((s) => s ? { ...s, title: e.target.value } : s)}
          />
        </label>

        <label className="mt-3 block text-sm text-flaque-ink">
          Artist
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            value={state.artist}
            placeholder={state.commonArtist === undefined ? "Mixed values" : ""}
            onChange={(e) => onChange((s) => s ? { ...s, artist: e.target.value } : s)}
          />
        </label>

        <label className="mt-3 block text-sm text-flaque-ink">
          Album
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            value={state.album}
            placeholder={state.commonAlbum === undefined ? "Mixed values" : ""}
            onChange={(e) => onChange((s) => s ? { ...s, album: e.target.value } : s)}
          />
        </label>

        <label className="mt-3 block text-sm text-flaque-ink">
          Year
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            inputMode="numeric"
            value={state.year}
            placeholder={state.commonYear === undefined ? "Mixed values" : "e.g. 1979"}
            onChange={(e) => onChange((s) => s ? { ...s, year: e.target.value } : s)}
          />
        </label>

        <label className="mt-3 block text-sm text-flaque-ink">
          Genre
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            value={state.genre}
            placeholder={state.commonGenre === undefined ? "Mixed values" : "e.g. Rock, Progressive Rock"}
            onChange={(e) => onChange((s) => s ? { ...s, genre: e.target.value } : s)}
          />
          <span className="mt-0.5 block text-xs text-flaque-steel">Comma-separated</span>
        </label>

        <p className="mt-3 text-xs text-flaque-steel">
          Leave a field empty to clear override and fallback to embedded file metadata.
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving..." : `Save ${state.trackIds.length} tracks`}
          </button>
        </div>
      </form>
    </div>
  );
}
