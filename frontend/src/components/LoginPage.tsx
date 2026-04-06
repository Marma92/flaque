import { FormEvent, useState } from "react";

type LoginPageProps = {
  onLogin: (login: string, password: string) => Promise<void>;
  onRequestPasswordReset: (login: string) => Promise<void>;
  onResetPassword: (token: string, newPassword: string) => Promise<void>;
};

type AuthMode = "login" | "forgot" | "reset";

const PASSWORD_MIN_LENGTH = 8;

function readResetTokenFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("resetToken");
  if (!token) {
    return null;
  }

  const normalized = token.trim();
  return normalized || null;
}

function clearResetTokenInUrl(): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("resetToken");
  window.history.replaceState({}, "", url.toString());
}

export function LoginPage({ onLogin, onRequestPasswordReset, onResetPassword }: LoginPageProps): JSX.Element {
  const [mode, setMode] = useState<AuthMode>(() => (readResetTokenFromUrl() ? "reset" : "login"));
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(() => readResetTokenFromUrl());
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function switchMode(nextMode: AuthMode): void {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (mode !== "login") {
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await onLogin(login, password);
      setPassword("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPasswordSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await onRequestPasswordReset(login);
      setMessage("If this account exists, a recovery email has been sent.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to request password reset");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPasswordSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!resetToken) {
      setError("Missing reset token.");
      return;
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      await onResetPassword(resetToken, newPassword);
      clearResetTokenInUrl();
      setResetToken(null);
      setNewPassword("");
      setConfirmNewPassword("");
      setPassword("");
      switchMode("login");
      setMessage("Password reset successful. You can now log in.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to reset password");
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

        {mode === "login" ? (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm text-flaque-ink">
              Username or email
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                required
                autoComplete="username"
              />
            </label>

            <label className="block text-sm text-flaque-ink">
              Password
              <div className="relative mt-1">
                <input
                  className="w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 pr-10 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-flaque-steel transition hover:text-flaque-ink"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-flaque-steel">Need help?</span>
              <button
                className="text-flaque-ink underline decoration-flaque-clay underline-offset-2 transition hover:text-black"
                type="button"
                onClick={() => switchMode("forgot")}
              >
                Forgot password?
              </button>
            </div>

            {error ? (
              <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}

            {message ? (
              <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
            ) : null}

            <button
              className="w-full rounded-xl bg-flaque-ink px-3 py-2 font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
              type="submit"
              disabled={loading}
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        ) : null}

        {mode === "forgot" ? (
          <form className="space-y-4" onSubmit={handleForgotPasswordSubmit}>
            <p className="text-sm text-flaque-steel">Enter your username or email to receive a password reset link.</p>

            <label className="block text-sm text-flaque-ink">
              Username or email
              <input
                className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                type="text"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                required
                autoComplete="username"
              />
            </label>

            {error ? (
              <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}

            {message ? (
              <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
            ) : null}

            <button
              className="w-full rounded-xl bg-flaque-ink px-3 py-2 font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
              type="submit"
              disabled={loading}
            >
              {loading ? "Sending..." : "Send recovery email"}
            </button>

            <button
              className="w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink transition hover:bg-flaque-cream"
              type="button"
              onClick={() => switchMode("login")}
              disabled={loading}
            >
              Back to login
            </button>
          </form>
        ) : null}

        {mode === "reset" ? (
          <form className="space-y-4" onSubmit={handleResetPasswordSubmit}>
            <p className="text-sm text-flaque-steel">Choose a new password for your account.</p>

            <label className="block text-sm text-flaque-ink">
              New password
              <div className="relative mt-1">
                <input
                  className="w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 pr-10 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-flaque-steel transition hover:text-flaque-ink"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            <label className="block text-sm text-flaque-ink">
              Confirm new password
              <div className="relative mt-1">
                <input
                  className="w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 pr-10 text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmNewPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-flaque-steel transition hover:text-flaque-ink"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            {error ? (
              <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}

            {message ? (
              <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>
            ) : null}

            <button
              className="w-full rounded-xl bg-flaque-ink px-3 py-2 font-medium text-flaque-cream transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
              type="submit"
              disabled={loading}
            >
              {loading ? "Resetting..." : "Reset password"}
            </button>

            <button
              className="w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-flaque-ink transition hover:bg-flaque-cream"
              type="button"
              onClick={() => {
                clearResetTokenInUrl();
                setResetToken(null);
                switchMode("login");
              }}
              disabled={loading}
            >
              Back to login
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
