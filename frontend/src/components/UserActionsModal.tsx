import type { FormEvent } from "react";

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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <form
        className="w-full max-w-md rounded-3xl border border-flaque-clay/60 bg-white p-5 shadow-panel"
        onSubmit={onSubmit}
      >
        <h3 className="font-display text-xl text-flaque-ink">
          {modalState.kind === "rename"
            ? `Rename ${modalState.user.username}`
            : modalState.kind === "changeEmail"
              ? `Change email for ${modalState.user.username}`
              : modalState.kind === "resetPassword"
                ? `Reset password for ${modalState.user.username}`
                : modalState.kind === "toggleRole"
                  ? `Change role for ${modalState.user.username}`
                  : `Delete ${modalState.user.username}`}
        </h3>

        {modalState.kind === "rename" ? (
          <label className="mt-4 block text-sm text-flaque-ink">
            New username
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
            New email
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
            New password
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
            Confirm role change for <strong>{modalState.user.username}</strong> to <strong>{modalState.nextRole}</strong>.
          </p>
        ) : null}

        {modalState.kind === "deleteUser" ? (
          <p className="mt-4 text-sm text-red-700">
            This action cannot be undone. The account <strong>{modalState.user.username}</strong> will be
            permanently deleted.
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
            Cancel
          </button>
          <button
            className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
              modalState.kind === "deleteUser" ? "bg-red-700 hover:bg-red-800" : "bg-flaque-ink hover:bg-black"
            }`}
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? "Saving..."
              : modalState.kind === "rename"
                ? "Save username"
                : modalState.kind === "changeEmail"
                  ? "Save email"
                  : modalState.kind === "resetPassword"
                    ? "Reset password"
                    : modalState.kind === "toggleRole"
                      ? "Confirm role"
                      : "Delete user"}
          </button>
        </div>
      </form>
    </div>
  );
}
