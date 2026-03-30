import { FormEvent, useMemo, useState } from "react";

import type { User } from "../types";
import { UserActionsModal } from "./UserActionsModal";
import type { ModalState } from "./UserActionsModal";

type NewUserInput = {
  username: string;
  password: string;
  email: string;
  role: "user" | "admin";
};

type UserRoleFilter = "all" | "user" | "admin";

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
    email?: string;
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
  const [email, setEmail] = useState("");
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
        email: email.trim(),
        role
      });

      setFormMessage("User created successfully.");
      setUsername("");
      setPassword("");
      setEmail("");
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

  function openChangeEmailModal(user: User): void {
    setModalError(null);
    setModalState({
      kind: "changeEmail",
      user,
      email: user.email
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

        case "changeEmail": {
          const nextEmail = modalState.email.trim();
          if (!nextEmail || !nextEmail.includes("@")) {
            setModalError("A valid email address is required.");
            return;
          }

          if (nextEmail === modalState.user.email) {
            setModalState(null);
            return;
          }

          await onPatchUser({
            userId: modalState.user.id,
            email: nextEmail
          });
          setActionMessage(`Email updated for ${modalState.user.username}.`);
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
      <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-xl text-flaque-ink">User Management</h3>
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

        <form className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-5" onSubmit={handleSubmit}>
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
            Email
            <input
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@example.com"
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

      <section className="overflow-hidden rounded-xl m-4 border border-flaque-clay/60 bg-white/85 shadow-panel backdrop-blur-sm">
        <div className="space-y-3 p-4 lg:hidden">
          {filteredUsers.map((entry) => {
            const runningAction = activeUserActionId === entry.id;
            const isCurrentUser = entry.id === currentUser.id;

            return (
              <article key={entry.id} className="rounded-2xl border border-flaque-clay/60 bg-flaque-cream/45 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-base font-medium text-flaque-ink">{entry.username}</p>
                    <p className="truncate text-xs text-flaque-steel">{entry.email}</p>
                    <p className="font-mono text-[11px] text-flaque-steel">{entry.id}</p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-[0.12em] ${
                      entry.role === "admin" ? "bg-flaque-ink text-flaque-cream" : "bg-flaque-cream text-flaque-ink"
                    }`}
                  >
                    {entry.role}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    className="rounded-lg border border-flaque-clay bg-white px-3 py-2 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={runningAction}
                    onClick={() => openRenameModal(entry)}
                  >
                    Rename
                  </button>
                  <button
                    className="rounded-lg border border-flaque-clay bg-white px-3 py-2 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={runningAction}
                    onClick={() => openChangeEmailModal(entry)}
                  >
                    Change email
                  </button>
                  <button
                    className="rounded-lg border border-flaque-clay bg-white px-3 py-2 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={runningAction}
                    onClick={() => openToggleRoleModal(entry)}
                  >
                    {entry.role === "admin" ? "Make user" : "Make admin"}
                  </button>
                  <button
                    className="rounded-lg border border-flaque-clay bg-white px-3 py-2 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={runningAction}
                    onClick={() => openResetPasswordModal(entry)}
                  >
                    Reset password
                  </button>
                  <button
                    className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={runningAction || isCurrentUser}
                    onClick={() => openDeleteModal(entry)}
                  >
                    {isCurrentUser ? "Current session" : "Delete user"}
                  </button>
                </div>
              </article>
            );
          })}

          {filteredUsers.length === 0 ? <p className="text-sm text-flaque-steel">No users match this search/filter.</p> : null}
        </div>

        <div className="hidden max-h-[50vh] overflow-auto lg:block">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
              <tr>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Email</th>
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
                    <td className="max-w-[14rem] truncate px-4 py-3 text-flaque-steel" title={entry.email}>{entry.email}</td>
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
                          onClick={() => openChangeEmailModal(entry)}
                        >
                          Change email
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
                  <td className="px-4 py-4 text-flaque-steel" colSpan={5}>
                    No users match this search/filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {modalState ? (
        <UserActionsModal
          modalState={modalState}
          onSubmit={handleModalSubmit}
          onClose={closeModal}
          submitting={modalSubmitting}
          error={modalError}
          onStateChange={setModalState}
        />
      ) : null}
    </div>
  );
}
