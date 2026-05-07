import type { JSX } from "react";

type BulkDeleteConfirmModalProps = {
  count: number;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function BulkDeleteConfirmModal({
  count,
  deleting,
  onCancel,
  onConfirm
}: BulkDeleteConfirmModalProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-3xl border border-flaque-clay/60 bg-white p-5 shadow-panel">
        <h3 className="font-display text-xl text-flaque-ink">Delete {count} files</h3>
        <p className="mt-2 text-sm text-red-700">
          This action cannot be undone. <strong>{count} file{count !== 1 ? "s" : ""}</strong> will
          be permanently removed from storage.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? "Deleting..." : `Delete ${count} files`}
          </button>
        </div>
      </div>
    </div>
  );
}
