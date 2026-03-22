import { FormEvent, useState } from "react";

type LoginPageProps = {
  onLogin: (username: string, password: string) => Promise<void>;
};

export function LoginPage({ onLogin }: LoginPageProps): JSX.Element {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await onLogin(username, password);
      setPassword("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <section className="w-full max-w-md rounded-3xl border border-flaque-clay/50 bg-white/80 p-8 shadow-panel backdrop-blur-sm">
        <h1 className="sr-only">Flaque login</h1>

        <div className="mb-6 flex justify-center">
          <div className="relative h-20 w-20 origin-center scale-[1.35]">
            <img
              className="header-logo-light h-full w-full object-contain drop-shadow-[0_8px_18px_rgba(44,31,26,0.18)]"
              src="/favicon.png"
              alt="Flaque logo"
            />
            <img
              className="header-logo-dark absolute inset-0 h-full w-full object-contain"
              src="/logo-dark.png"
              alt="Flaque logo (dark mode)"
            />
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-flaque-ink">
            Username
            <input
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
            />
          </label>

          <label className="block text-sm text-flaque-ink">
            Password
            <input
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          <button
            className="w-full rounded-xl bg-flaque-ink px-3 py-2 font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}
