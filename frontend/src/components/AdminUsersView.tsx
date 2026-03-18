import { FormEvent, useState } from "react";

import type { User } from "../types";

type NewUserInput = {
  username: string;
  password: string;
  role: "user" | "admin";
};

type AdminUsersViewProps = {
  users: User[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onCreateUser: (input: NewUserInput) => Promise<void>;
};

export function AdminUsersView({
  users,
  loading,
  error,
  onRefresh,
  onCreateUser
}: AdminUsersViewProps): JSX.Element {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-flaque-steel">Admin</p>
            <h2 className="mt-1 font-display text-2xl text-flaque-ink">User Management</h2>
            <p className="mt-2 text-sm text-flaque-steel">
              Create user accounts for your friends and control admin access.
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

        {formMessage ? <p className="mt-3 text-sm text-flaque-steel">{formMessage}</p> : null}
        {error ? (
          <p className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-3xl border border-flaque-clay/60 bg-white/85 shadow-panel backdrop-blur-sm">
        <div className="max-h-[50vh] overflow-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-flaque-cream/95 text-flaque-ink">
              <tr>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">User ID</th>
              </tr>
            </thead>
            <tbody>
              {users.map((entry) => (
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
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-flaque-steel" colSpan={3}>
                    No users found.
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
