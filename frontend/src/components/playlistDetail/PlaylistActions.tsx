import type { JSX } from "react";
import { useTranslation } from "react-i18next";

type PlaylistActionsProps = {
  editing: boolean;
  saving: boolean;
  coverUploading: boolean;
  canEdit: boolean;
  canManage: boolean;
  onPlayAll: () => void;
  onShufflePlay: () => void;
  onStartEditing: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
};

export function PlaylistActions({
  editing,
  saving,
  coverUploading,
  canEdit,
  canManage,
  onPlayAll,
  onShufflePlay,
  onStartEditing,
  onSave,
  onCancel,
  onDelete
}: PlaylistActionsProps): JSX.Element {
  const { t } = useTranslation("playlists");
  if (editing) {
    return (
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black disabled:opacity-60"
          onClick={onSave}
          disabled={saving || coverUploading}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {coverUploading ? t("uploadingCover") : saving ? t("saving") : t("save")}
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl border border-flaque-clay px-4 py-2 text-sm text-flaque-steel transition hover:bg-flaque-cream"
          onClick={onCancel}
          disabled={saving}
        >
          {t("cancel")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black"
        onClick={onPlayAll}
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
        {t("playAll")}
      </button>

      <button
        type="button"
        className="flex items-center gap-1.5 rounded-xl border border-flaque-clay px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream"
        onClick={onShufflePlay}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M16 3h5v5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 20l8-8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 3l-7 7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 4l6 6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 16l2 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t("shuffle")}
      </button>

      {canEdit ? (
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl border border-flaque-clay px-3 py-2 text-sm text-flaque-steel transition hover:bg-flaque-cream hover:text-flaque-ink"
          onClick={onStartEditing}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          {t("edit")}
        </button>
      ) : null}

      {canManage ? (
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm text-red-500 transition hover:bg-red-50 hover:text-red-600"
          onClick={onDelete}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          {t("delete")}
        </button>
      ) : null}
    </div>
  );
}
