import type { FormEvent } from "react";
import { Trans, useTranslation } from "react-i18next";

import type { User } from "../types";

export type ModalState =
  | {
      kind: "rename";
      user: User;
      username: string;
    }
  | {
      kind: "changeEmail";
      user: User;
      email: string;
    }
  | {
      kind: "resetPassword";
      user: User;
      password: string;
    }
  | {
      kind: "toggleRole";
      user: User;
      nextRole: "user" | "admin";
    }
  | {
      kind: "deleteUser";
      user: User;
    };

type UserActionsModalProps = {
  modalState: ModalState;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  submitting: boolean;
  error: string | null;
  onStateChange: (updater: (current: ModalState | null) => ModalState | null) => void;
};

export function UserActionsModal({
  modalState,
  onSubmit,
  onClose,
  submitting,
  error,
  onStateChange
}: UserActionsModalProps): JSX.Element {
  const { t } = useTranslation("admin");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <form
        className="w-full max-w-md rounded-3xl border border-flaque-clay/60 bg-white p-5 shadow-panel"
        onSubmit={onSubmit}
      >
        <h3 className="font-display text-xl text-flaque-ink">
          {modalState.kind === "rename"
            ? t("users.modal.renameTitle", { username: modalState.user.username })
            : modalState.kind === "changeEmail"
              ? t("users.modal.changeEmailTitle", { username: modalState.user.username })
              : modalState.kind === "resetPassword"
                ? t("users.modal.resetPasswordTitle", { username: modalState.user.username })
                : modalState.kind === "toggleRole"
                  ? t("users.modal.toggleRoleTitle", { username: modalState.user.username })
                  : t("users.modal.deleteTitle", { username: modalState.user.username })}
        </h3>

        {modalState.kind === "rename" ? (
          <label className="mt-4 block text-sm text-flaque-ink">
            {t("users.modal.newUsername")}
            <input
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="text"
              value={modalState.username}
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9._-]+"
              onChange={(event) => {
                onStateChange((current) =>
                  current && current.kind === "rename"
                    ? {
                        ...current,
                        username: event.target.value
                      }
                    : current
                );
              }}
              autoFocus
            />
          </label>
        ) : null}

        {modalState.kind === "changeEmail" ? (
          <label className="mt-4 block text-sm text-flaque-ink">
            {t("users.modal.newEmail")}
            <input
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="email"
              value={modalState.email}
              onChange={(event) => {
                onStateChange((current) =>
                  current && current.kind === "changeEmail"
                    ? {
                        ...current,
                        email: event.target.value
                      }
                    : current
                );
              }}
              autoFocus
            />
          </label>
        ) : null}

        {modalState.kind === "resetPassword" ? (
          <label className="mt-4 block text-sm text-flaque-ink">
            {t("users.modal.newPassword")}
            <input
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="password"
              value={modalState.password}
              minLength={8}
              onChange={(event) => {
                onStateChange((current) =>
                  current && current.kind === "resetPassword"
                    ? {
                        ...current,
                        password: event.target.value
                      }
                    : current
                );
              }}
              autoFocus
            />
          </label>
        ) : null}

        {modalState.kind === "toggleRole" ? (
          <p className="mt-4 text-sm text-flaque-steel">
            <Trans
              i18nKey="users.modal.confirmRole"
              ns="admin"
              values={{ username: modalState.user.username, role: modalState.nextRole }}
              components={{ strong: <strong /> }}
            />
          </p>
        ) : null}

        {modalState.kind === "deleteUser" ? (
          <p className="mt-4 text-sm text-red-700">
            <Trans
              i18nKey="users.modal.deleteWarning"
              ns="admin"
              values={{ username: modalState.user.username }}
              components={{ strong: <strong /> }}
            />
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onClose}
            disabled={submitting}
          >
            {t("users.modal.cancel")}
          </button>
          <button
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              modalState.kind === "deleteUser" ? "bg-red-700 hover:bg-red-800" : "bg-flaque-ink hover:bg-black"
            }`}
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? t("users.modal.saving")
              : modalState.kind === "rename"
                ? t("users.modal.saveUsername")
                : modalState.kind === "changeEmail"
                  ? t("users.modal.saveEmail")
                  : modalState.kind === "resetPassword"
                    ? t("users.resetPassword")
                    : modalState.kind === "toggleRole"
                      ? t("users.modal.confirmRoleBtn")
                      : t("users.modal.deleteBtn")}
          </button>
        </div>
      </form>
    </div>
  );
}
