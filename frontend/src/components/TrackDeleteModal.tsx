import { Trans, useTranslation } from "react-i18next";

import type { Track } from "../types";
import { getTrackDisplayTitle } from "../utils/tracks";

type TrackDeleteModalProps = {
  track: Track;
  onConfirm: () => void;
  onClose: () => void;
  deleting: boolean;
};

export function TrackDeleteModal({
  track,
  onConfirm,
  onClose,
  deleting
}: TrackDeleteModalProps): JSX.Element {
  const { t } = useTranslation("admin");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-3xl border border-flaque-clay/60 bg-white p-5 shadow-panel">
        <h3 className="font-display text-xl text-flaque-ink">{t("files.deleteTrackTitle")}</h3>
        <p className="mt-2 text-sm text-red-700">
          <Trans
            i18nKey="files.deleteTrackWarning"
            ns="admin"
            values={{ title: getTrackDisplayTitle(track) }}
            components={{ strong: <strong /> }}
          />
        </p>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onClose}
            disabled={deleting}
          >
            {t("bulk.cancel")}
          </button>
          <button
            className="rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? t("bulk.deleting") : t("files.deleteFile")}
          </button>
        </div>
      </div>
    </div>
  );
}
