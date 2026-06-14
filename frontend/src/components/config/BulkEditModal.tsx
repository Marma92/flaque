import type { Dispatch, FormEvent, JSX, SetStateAction } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("admin");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <form
        className="w-full max-w-md rounded-3xl border border-flaque-clay/60 bg-white p-5 shadow-panel"
        onSubmit={onSubmit}
      >
        <h3 className="font-display text-xl text-flaque-ink">{t("bulk.editTitle", { count: state.trackIds.length })}</h3>
        <p className="mt-2 text-sm text-flaque-steel">
          {t("bulk.editDescription")}
        </p>

        <label className="mt-4 block text-sm text-flaque-ink">
          {t("fields.title")}
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            value={state.title}
            placeholder={state.commonTitle === undefined ? t("bulk.mixedValues") : ""}
            onChange={(e) => onChange((s) => s ? { ...s, title: e.target.value } : s)}
          />
        </label>

        <label className="mt-3 block text-sm text-flaque-ink">
          {t("fields.artist")}
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            value={state.artist}
            placeholder={state.commonArtist === undefined ? t("bulk.mixedValues") : ""}
            onChange={(e) => onChange((s) => s ? { ...s, artist: e.target.value } : s)}
          />
        </label>

        <label className="mt-3 block text-sm text-flaque-ink">
          {t("fields.album")}
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            value={state.album}
            placeholder={state.commonAlbum === undefined ? t("bulk.mixedValues") : ""}
            onChange={(e) => onChange((s) => s ? { ...s, album: e.target.value } : s)}
          />
        </label>

        <label className="mt-3 block text-sm text-flaque-ink">
          {t("fields.year")}
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            inputMode="numeric"
            value={state.year}
            placeholder={state.commonYear === undefined ? t("bulk.mixedValues") : t("fields.yearPlaceholder")}
            onChange={(e) => onChange((s) => s ? { ...s, year: e.target.value } : s)}
          />
        </label>

        <label className="mt-3 block text-sm text-flaque-ink">
          {t("fields.genre")}
          <input
            className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
            type="text"
            value={state.genre}
            placeholder={state.commonGenre === undefined ? t("bulk.mixedValues") : t("fields.genrePlaceholder")}
            onChange={(e) => onChange((s) => s ? { ...s, genre: e.target.value } : s)}
          />
          <span className="mt-0.5 block text-xs text-flaque-steel">{t("fields.commaSeparated")}</span>
        </label>

        <p className="mt-3 text-xs text-flaque-steel">
          {t("bulk.editHint")}
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onCancel}
            disabled={saving}
          >
            {t("bulk.cancel")}
          </button>
          <button
            className="rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={saving}
          >
            {saving ? t("bulk.saving") : t("bulk.save", { count: state.trackIds.length })}
          </button>
        </div>
      </form>
    </div>
  );
}
