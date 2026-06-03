import type { JSX } from "react";
import { Trans, useTranslation } from "react-i18next";

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
  const { t } = useTranslation("admin");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-3xl border border-flaque-clay/60 bg-white p-5 shadow-panel">
        <h3 className="font-display text-xl text-flaque-ink">{t("bulk.deleteConfirm", { count })}</h3>
        <p className="mt-2 text-sm text-red-700">
          <Trans i18nKey="bulk.deleteWarning" ns="admin" count={count} components={{ strong: <strong /> }} />
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onCancel}
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
            {deleting ? t("bulk.deleting") : t("bulk.deleteConfirm", { count })}
          </button>
        </div>
      </div>
    </div>
  );
}
