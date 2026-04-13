import type { FormEvent } from "react";

import type { Track } from "../types";
import { getTrackDisplayTitle } from "../utils/tracks";

export type EditTrackState = {
  track: Track;
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
};

type TrackEditModalProps = {
  editState: EditTrackState;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  saving: boolean;
  onStateChange: (updater: (current: EditTrackState | null) => EditTrackState | null) => void;
};

export function TrackEditModal({
  editState,
  onSubmit,
  onClose,
  saving,
  onStateChange
}: TrackEditModalProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <form
        className="w-full max-w-md rounded-3xl border border-flaque-clay/60 bg-white p-5 shadow-panel"
        onSubmit={onSubmit}
      >
        <h3 className="font-display text-xl text-flaque-ink">Edit metadata</h3>
        <p className="mt-2 text-sm text-flaque-steel">{getTrackDisplayTitle(editState.track)}</p>

        <label className="mt-4 block text-sm text-flaque-ink">
          Title
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            value={editState.title}
            onChange={(event) =>
              onStateChange((current) =>
                current
                  ? {
                      ...current,
                      title: event.target.value
                    }
                  : current
              )
            }
          />
        </label>

        <label className="mt-3 block text-sm text-flaque-ink">
          Artist
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            value={editState.artist}
            onChange={(event) =>
              onStateChange((current) =>
                current
                  ? {
                      ...current,
                      artist: event.target.value
                    }
                  : current
              )
            }
          />
        </label>

        <label className="mt-3 block text-sm text-flaque-ink">
          Album
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            value={editState.album}
            onChange={(event) =>
              onStateChange((current) =>
                current
                  ? {
                      ...current,
                      album: event.target.value
                    }
                  : current
              )
            }
          />
        </label>

        <label className="mt-3 block text-sm text-flaque-ink">
          Year
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            inputMode="numeric"
            value={editState.year}
            placeholder="e.g. 1979"
            onChange={(event) =>
              onStateChange((current) =>
                current
                  ? {
                      ...current,
                      year: event.target.value
                    }
                  : current
              )
            }
          />
        </label>

        <label className="mt-3 block text-sm text-flaque-ink">
          Genre
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            value={editState.genre}
            placeholder="e.g. Rock, Progressive Rock"
            onChange={(event) =>
              onStateChange((current) =>
                current
                  ? {
                      ...current,
                      genre: event.target.value
                    }
                  : current
              )
            }
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
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
