import { FormEvent, useMemo, useState } from "react";

import type { User } from "../types";

type NewUserInput = {
  username: string;
  password: string;
  role: "user" | "admin";
};

type UserRoleFilter = "all" | "user" | "admin";

type ModalState =
  | {
      kind: "rename";
      user: User;
      username: string;
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

type AdminUsersViewProps = {
  currentUser: User;
  users: User[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onCreateUser: (input: NewUserInput) => Promise<void>;
  onPatchUser: (input: {
    userId: string;
    username?: string;
    role?: "user" | "admin";
  }) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onResetPassword: (userId: string, password: string) => Promise<void>;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function AdminUsersView({
  currentUser,
  users,
  loading,
  error,
  onRefresh,
  onCreateUser,
  onPatchUser,
  onDeleteUser,
  onResetPassword
}: AdminUsersViewProps): JSX.Element {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("all");
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeUserActionId, setActiveUserActionId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const query = normalize(searchText);

    return users.filter((entry) => {
      if (roleFilter !== "all" && entry.role !== roleFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchable = `${entry.username} ${entry.id} ${entry.role}`.toLowerCase();
      return searchable.includes(query);
    });
  }, [users, searchText, roleFilter]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setFormMessage(null);

    try {
      await onCreateUser({
        username: username.trim(),
        password,
        role
      });

      setFormMessage("User created successfully.");
      setUsername("");
      setPassword("");
      setRole("user");
    } catch (submitError) {
      setFormMessage(submitError instanceof Error ? submitError.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  function closeModal(): void {
    if (modalSubmitting) {
      return;
    }

    setModalState(null);
    setModalError(null);
  }

  function openRenameModal(user: User): void {
    setModalError(null);
    setModalState({
      kind: "rename",
      user,
      username: user.username
    });
  }

  function openResetPasswordModal(user: User): void {
    setModalError(null);
    setModalState({
      kind: "resetPassword",
      user,
      password: ""
    });
  }

  function openToggleRoleModal(user: User): void {
    setModalError(null);
    setModalState({
      kind: "toggleRole",
      user,
      nextRole: user.role === "admin" ? "user" : "admin"
    });
  }

  function openDeleteModal(user: User): void {
    if (user.id === currentUser.id) {
      setActionMessage("You cannot delete your own account.");
      return;
    }

    setModalError(null);
    setModalState({
      kind: "deleteUser",
      user
    });
  }

  async function handleModalSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!modalState) {
      return;
    }

    setModalError(null);
    setActionMessage(null);
    setModalSubmitting(true);
    setActiveUserActionId(modalState.user.id);

    try {
      switch (modalState.kind) {
        case "rename": {
          const nextUsername = modalState.username.trim();
          if (!nextUsername) {
            setModalError("Username cannot be empty.");
            return;
          }

          if (nextUsername === modalState.user.username) {
            setModalState(null);
            return;
          }

          await onPatchUser({
            userId: modalState.user.id,
            username: nextUsername
          });
          setActionMessage(`Username updated for ${modalState.user.username}.`);
          setModalState(null);
          break;
        }

        case "resetPassword": {
          const nextPassword = modalState.password.trim();
          if (nextPassword.length < 8) {
            setModalError("Password must be at least 8 characters.");
            return;
          }

          await onResetPassword(modalState.user.id, nextPassword);
          setActionMessage(`Password reset for ${modalState.user.username}.`);
          setModalState(null);
          break;
        }

        case "toggleRole": {
          await onPatchUser({
            userId: modalState.user.id,
            role: modalState.nextRole
          });
          setActionMessage(`Role updated for ${modalState.user.username}: ${modalState.nextRole}.`);
          setModalState(null);
          break;
        }

        case "deleteUser": {
          if (modalState.user.id === currentUser.id) {
            setModalError("You cannot delete your own account.");
            return;
          }

          await onDeleteUser(modalState.user.id);
          setActionMessage(`User ${modalState.user.username} deleted.`);
          setModalState(null);
          break;
        }
      }
    } catch (actionError) {
      setModalError(actionError instanceof Error ? actionError.message : "Action failed");
    } finally {
      setModalSubmitting(false);
      setActiveUserActionId(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-flaque-steel">Admin</p>
            <h2 className="mt-1 font-display text-2xl text-flaque-ink">User Management</h2>
            <p className="mt-2 text-sm text-flaque-steel">
              Create user accounts, reset passwords, and remove access when needed.
            </p>
          </div>

          <button
            className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={handleRefresh}
            disabled={loading || refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh users"}
          </button>
        </div>

        <form className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4" onSubmit={handleSubmit}>
          <label className="text-sm text-flaque-ink">
            Username
            <input
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={32}
              pattern="[a-zA-Z0-9._-]+"
              required
            />
          </label>

          <label className="text-sm text-flaque-ink">
            Password
            <input
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={256}
              autoComplete="new-password"
              required
            />
          </label>

          <label className="text-sm text-flaque-ink">
            Role
            <select
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              value={role}
              onChange={(event) => setRole(event.target.value as "user" | "admin")}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>

          <div className="flex items-end">
            <button
              className="w-full rounded-xl bg-flaque-ink px-4 py-2 text-sm font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Creating..." : "Create user"}
            </button>
          </div>
        </form>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="text-sm text-flaque-ink md:col-span-2">
            Search users
            <input
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="search"
              placeholder="Search by username or user id"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>

          <label className="text-sm text-flaque-ink">
            Role filter
            <select
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as UserRoleFilter)}
            >
              <option value="all">all roles</option>
              <option value="admin">admin</option>
              <option value="user">user</option>
            </select>
          </label>
        </div>

        <p className="mt-3 text-sm text-flaque-steel">
          Showing {filteredUsers.length} / {users.length} users.
        </p>

        {formMessage ? (
          <p className="mt-3 text-sm text-flaque-steel" role="status" aria-live="polite">
            {formMessage}
          </p>
        ) : null}
        {actionMessage ? (
          <p className="mt-2 text-sm text-flaque-steel" role="status" aria-live="polite">
            {actionMessage}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-3xl border border-flaque-clay/60 bg-white/85 shadow-panel backdrop-blur-sm">
        <div className="max-h-[50vh] overflow-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
              <tr>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">User ID</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((entry) => {
                const runningAction = activeUserActionId === entry.id;
                const isCurrentUser = entry.id === currentUser.id;

                return (
                  <tr key={entry.id} className="border-t border-flaque-clay/40">
                    <td className="px-4 py-3 text-flaque-ink">{entry.username}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-[0.12em] ${
                          entry.role === "admin"
                            ? "bg-flaque-ink text-flaque-cream"
                            : "bg-flaque-cream text-flaque-ink"
                        }`}
                      >
                        {entry.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-flaque-steel">{entry.id}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          disabled={runningAction}
                          onClick={() => openRenameModal(entry)}
                        >
                          Rename
                        </button>
                        <button
                          className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          disabled={runningAction}
                          onClick={() => openToggleRoleModal(entry)}
                        >
                          {entry.role === "admin" ? "Make user" : "Make admin"}
                        </button>
                        <button
                          className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          disabled={runningAction}
                          onClick={() => openResetPasswordModal(entry)}
                        >
                          Reset password
                        </button>
                        <button
                          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          disabled={runningAction || isCurrentUser}
                          onClick={() => openDeleteModal(entry)}
                        >
                          {isCurrentUser ? "Current session" : "Delete user"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-flaque-steel" colSpan={4}>
                    No users match this search/filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {modalState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            className="w-full max-w-md rounded-3xl border border-flaque-clay/60 bg-white p-5 shadow-panel"
            onSubmit={handleModalSubmit}
          >
            <h3 className="font-display text-xl text-flaque-ink">
              {modalState.kind === "rename"
                ? `Rename ${modalState.user.username}`
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
                    setModalState((current) =>
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

            {modalState.kind === "resetPassword" ? (
              <label className="mt-4 block text-sm text-flaque-ink">
                New password
                <input
                  className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  type="password"
                  value={modalState.password}
                  minLength={8}
                  onChange={(event) => {
                    setModalState((current) =>
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

            {modalError ? (
              <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{modalError}</p>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={closeModal}
                disabled={modalSubmitting}
              >
                Cancel
              </button>
              <button
                className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  modalState.kind === "deleteUser" ? "bg-red-700 hover:bg-red-800" : "bg-flaque-ink hover:bg-black"
                }`}
                type="submit"
                disabled={modalSubmitting}
              >
                {modalSubmitting
                  ? "Saving..."
                  : modalState.kind === "rename"
                    ? "Save username"
                    : modalState.kind === "resetPassword"
                      ? "Reset password"
                      : modalState.kind === "toggleRole"
                        ? "Confirm role"
                        : "Delete user"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
