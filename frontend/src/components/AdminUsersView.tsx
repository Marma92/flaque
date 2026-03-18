import { FormEvent, useMemo, useState } from "react";

import type { User } from "../types";

type NewUserInput = {
  username: string;
  password: string;
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

  async function handleResetPassword(user: User): Promise<void> {
    const passwordPrompt = window.prompt(`New password for ${user.username} (8+ chars):`);
    if (passwordPrompt === null) {
      return;
    }

    const trimmedPassword = passwordPrompt.trim();
    if (trimmedPassword.length < 8) {
      setActionMessage("Password reset canceled: password must be at least 8 characters.");
      return;
    }

    setActionMessage(null);
    setActiveUserActionId(user.id);

    try {
      await onResetPassword(user.id, trimmedPassword);
      setActionMessage(`Password reset for ${user.username}.`);
    } catch (actionError) {
      setActionMessage(actionError instanceof Error ? actionError.message : "Password reset failed");
    } finally {
      setActiveUserActionId(null);
    }
  }

  async function handleRenameUser(user: User): Promise<void> {
    const usernamePrompt = window.prompt(`New username for ${user.username}:`, user.username);
    if (usernamePrompt === null) {
      return;
    }

    const nextUsername = usernamePrompt.trim();
    if (!nextUsername) {
      setActionMessage("Username update canceled: username cannot be empty.");
      return;
    }

    if (nextUsername === user.username) {
      return;
    }

    setActionMessage(null);
    setActiveUserActionId(user.id);

    try {
      await onPatchUser({
        userId: user.id,
        username: nextUsername
      });
      setActionMessage(`Username updated for ${user.username}.`);
    } catch (actionError) {
      setActionMessage(actionError instanceof Error ? actionError.message : "Username update failed");
    } finally {
      setActiveUserActionId(null);
    }
  }

  async function handleToggleRole(user: User): Promise<void> {
    const nextRole: "user" | "admin" = user.role === "admin" ? "user" : "admin";
    const confirmed = window.confirm(`Change ${user.username} role to ${nextRole}?`);
    if (!confirmed) {
      return;
    }

    setActionMessage(null);
    setActiveUserActionId(user.id);

    try {
      await onPatchUser({
        userId: user.id,
        role: nextRole
      });
      setActionMessage(`Role updated for ${user.username}: ${nextRole}.`);
    } catch (actionError) {
      setActionMessage(actionError instanceof Error ? actionError.message : "Role update failed");
    } finally {
      setActiveUserActionId(null);
    }
  }

  async function handleDeleteUser(user: User): Promise<void> {
    if (user.id === currentUser.id) {
      setActionMessage("You cannot delete your own account.");
      return;
    }

    const confirmed = window.confirm(`Delete user \"${user.username}\"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setActionMessage(null);
    setActiveUserActionId(user.id);

    try {
      await onDeleteUser(user.id);
      setActionMessage(`User ${user.username} deleted.`);
    } catch (actionError) {
      setActionMessage(actionError instanceof Error ? actionError.message : "User deletion failed");
    } finally {
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

        {formMessage ? <p className="mt-3 text-sm text-flaque-steel">{formMessage}</p> : null}
        {actionMessage ? <p className="mt-2 text-sm text-flaque-steel">{actionMessage}</p> : null}
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
                          onClick={() => {
                            void handleRenameUser(entry);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          disabled={runningAction}
                          onClick={() => {
                            void handleToggleRole(entry);
                          }}
                        >
                          {entry.role === "admin" ? "Make user" : "Make admin"}
                        </button>
                        <button
                          className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          disabled={runningAction}
                          onClick={() => {
                            void handleResetPassword(entry);
                          }}
                        >
                          Reset password
                        </button>
                        <button
                          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          type="button"
                          disabled={runningAction || isCurrentUser}
                          onClick={() => {
                            void handleDeleteUser(entry);
                          }}
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
    </div>
  );
}
