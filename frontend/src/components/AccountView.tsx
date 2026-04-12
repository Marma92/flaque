import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { User, UserSession } from "../types";

type AccountViewProps = {
  user: User;
  avatarUrl: string;
  onUpdatePhoto: (file: File) => Promise<void>;
  onUpdateEmail: (email: string) => Promise<void>;
  onChangePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
  onListSessions: () => Promise<UserSession[]>;
  onRevokeSession: (sessionId: string) => Promise<void>;
  onLogoutOtherSessions: () => Promise<number>;
  onLogout: () => Promise<void> | void;
};

function getUserInitial(user: User): string {
  const value = user.username.trim();
  if (!value) {
    return "U";
  }

  return value[0]?.toUpperCase() ?? "U";
}

/**
 * Self-service account page: avatar upload, password change and logout.
 */
function formatSessionTimestamp(value: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString();
}

function getSessionTitle(session: UserSession): string {
  if (session.label) {
    return session.label;
  }

  if (session.userAgent) {
    return session.userAgent;
  }

  return "Unknown device";
}

export function AccountView({
  user,
  avatarUrl,
  onUpdatePhoto,
  onUpdateEmail,
  onChangePassword,
  onListSessions,
  onRevokeSession,
  onLogoutOtherSessions,
  onLogout
}: AccountViewProps): JSX.Element {
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [selectedPhotoPreviewUrl, setSelectedPhotoPreviewUrl] = useState<string | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);

  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState(user.email);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [updatingEmail, setUpdatingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsMessage, setSessionsMessage] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [loggingOutOtherSessions, setLoggingOutOtherSessions] = useState(false);

  const initial = useMemo(() => getUserInitial(user), [user]);
  const displayedAvatarUrl = selectedPhotoPreviewUrl ?? avatarUrl;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [displayedAvatarUrl]);

  useEffect(() => {
    return () => {
      if (selectedPhotoPreviewUrl) {
        URL.revokeObjectURL(selectedPhotoPreviewUrl);
      }
    };
  }, [selectedPhotoPreviewUrl]);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    setSessionsMessage(null);

    try {
      const nextSessions = await onListSessions();
      setSessions(nextSessions);
    } catch (error) {
      setSessionsMessage(error instanceof Error ? error.message : "Unable to load sessions");
    } finally {
      setLoadingSessions(false);
    }
  }, [onListSessions]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions, user.id]);

  function handlePhotoSelection(event: ChangeEvent<HTMLInputElement>): void {
    const nextFile = event.target.files?.[0] ?? null;
    setPhotoMessage(null);

    if (selectedPhotoPreviewUrl) {
      URL.revokeObjectURL(selectedPhotoPreviewUrl);
    }

    if (!nextFile) {
      setSelectedPhoto(null);
      setSelectedPhotoPreviewUrl(null);
      return;
    }

    setSelectedPhoto(nextFile);
    setSelectedPhotoPreviewUrl(URL.createObjectURL(nextFile));
  }

  function openPhotoPicker(): void {
    photoInputRef.current?.click();
  }

  async function handlePhotoSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedPhoto) {
      setPhotoMessage("Select a photo before saving.");
      return;
    }

    setUpdatingPhoto(true);
    setPhotoMessage(null);

    try {
      await onUpdatePhoto(selectedPhoto);
      setPhotoMessage("Profile photo updated.");
      setSelectedPhoto(null);

      if (selectedPhotoPreviewUrl) {
        URL.revokeObjectURL(selectedPhotoPreviewUrl);
      }
      setSelectedPhotoPreviewUrl(null);
    } catch (error) {
      setPhotoMessage(error instanceof Error ? error.message : "Unable to update profile photo");
    } finally {
      setUpdatingPhoto(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPasswordMessage(null);

    if (!currentPassword.trim() || !newPassword.trim()) {
      setPasswordMessage({ text: "Current and new password are required.", isError: true });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ text: "Password confirmation does not match.", isError: true });
      return;
    }

    setUpdatingPassword(true);

    try {
      await onChangePassword({
        currentPassword,
        newPassword
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage({ text: "Password updated.", isError: false });
    } catch (error) {
      setPasswordMessage({
        text: error instanceof Error ? error.message : "Unable to update password",
        isError: true
      });
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function handleRevokeSession(sessionId: string): Promise<void> {
    setRevokingSessionId(sessionId);
    setSessionsMessage(null);

    try {
      await onRevokeSession(sessionId);
      await loadSessions();
      setSessionsMessage("Session revoked.");
    } catch (error) {
      setSessionsMessage(error instanceof Error ? error.message : "Unable to revoke session");
    } finally {
      setRevokingSessionId(null);
    }
  }

  async function handleLogoutOthers(): Promise<void> {
    setLoggingOutOtherSessions(true);
    setSessionsMessage(null);

    try {
      const revokedCount = await onLogoutOtherSessions();
      await loadSessions();
      setSessionsMessage(`${revokedCount} session${revokedCount === 1 ? "" : "s"} logged out.`);
    } catch (error) {
      setSessionsMessage(error instanceof Error ? error.message : "Unable to log out other sessions");
    } finally {
      setLoggingOutOtherSessions(false);
    }
  }

  const hasOtherSessions = sessions.some((session) => !session.current);

  return (
    <div>
      <section className="rounded-t-xl m-4 mb-0 border border-b-0 border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="mt-1 font-display text-2xl text-flaque-ink">Account</h2>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <button
              className="rounded-xl bg-flaque-ink px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-flaque-cream"
              type="button"
            >
              Edit profile
            </button>

            <button
              className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-red-700 transition hover:bg-red-100"
              type="button"
              onClick={() => {
                void onLogout();
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-b-xl m-4 mt-0 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <form className="mt-4 space-y-4" onSubmit={(event) => void handlePhotoSubmit(event)}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="shrink-0">
              <button
                className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-flaque-clay/60 bg-flaque-cream/60 transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flaque-sand"
                type="button"
                onClick={openPhotoPicker}
                aria-label="Choose profile photo"
              >
                {avatarLoadFailed ? (
                  <span className="font-display text-2xl text-flaque-ink">{initial}</span>
                ) : (
                  <img
                    className="h-full w-full object-cover"
                    src={displayedAvatarUrl}
                    alt={`${user.username} profile`}
                    onError={() => {
                      setAvatarLoadFailed(true);
                    }}
                  />
                )}

                <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/35 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 20h9" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M16.5 3.5a2.1 2.1 0 113 3L8 18l-4 1 1-4 11.5-11.5z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>

              <input
                ref={photoInputRef}
                id="account-photo"
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                onChange={handlePhotoSelection}
              />

              {selectedPhoto ? <p className="mt-1 text-xs text-flaque-steel">{selectedPhoto.name}</p> : null}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-3xl text-flaque-ink">{user.username}</p>

              {editingEmail ? (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    className="w-full max-w-xs rounded-xl border border-flaque-clay bg-white px-3 py-1.5 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
                    type="email"
                    value={emailDraft}
                    onChange={(event) => setEmailDraft(event.target.value)}
                    autoFocus
                  />
                  <button
                    className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={updatingEmail}
                    onClick={async () => {
                      const trimmed = emailDraft.trim();
                      if (!trimmed || !trimmed.includes("@")) {
                        setEmailMessage("A valid email address is required.");
                        return;
                      }
                      if (trimmed === user.email) {
                        setEditingEmail(false);
                        setEmailMessage(null);
                        return;
                      }
                      setUpdatingEmail(true);
                      setEmailMessage(null);
                      try {
                        await onUpdateEmail(trimmed);
                        setEmailMessage("Email updated.");
                        setEditingEmail(false);
                      } catch (error) {
                        setEmailMessage(error instanceof Error ? error.message : "Unable to update email");
                      } finally {
                        setUpdatingEmail(false);
                      }
                    }}
                  >
                    {updatingEmail ? "Saving..." : "Save"}
                  </button>
                  <button
                    className="rounded-lg border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={updatingEmail}
                    onClick={() => {
                      setEditingEmail(false);
                      setEmailDraft(user.email);
                      setEmailMessage(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <p className="mt-1 truncate text-sm text-flaque-steel">
                  {user.email}
                  <button
                    className="ml-2 text-xs text-flaque-ink/70 underline transition hover:text-flaque-ink"
                    type="button"
                    onClick={() => {
                      setEmailDraft(user.email);
                      setEditingEmail(true);
                      setEmailMessage(null);
                    }}
                  >
                    edit
                  </button>
                </p>
              )}

              {emailMessage ? <p className="mt-1 text-xs text-flaque-steel">{emailMessage}</p> : null}

              <p className="mt-2 text-xs text-flaque-steel/90">Username is fixed to keep your login stable.</p>
            </div>
          </div>

          {selectedPhoto ? (
            <div>
              <button
                className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={updatingPhoto}
              >
                {updatingPhoto ? "Saving..." : "Save photo"}
              </button>
            </div>
          ) : null}

          {photoMessage ? <p className="text-sm text-flaque-steel">{photoMessage}</p> : null}
        </form>
      </section>

      <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">Password</h3>

        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void handlePasswordSubmit(event)}>
          <label className="text-sm text-flaque-steel" htmlFor="account-current-password">
            Current password
            <input
              id="account-current-password"
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>

          <label className="text-sm text-flaque-steel" htmlFor="account-new-password">
            New password
            <input
              id="account-new-password"
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>

          <label className="text-sm text-flaque-steel md:col-span-2" htmlFor="account-confirm-password">
            Confirm new password
            <input
              id="account-confirm-password"
              className="mt-1 w-full rounded-xl border border-flaque-clay bg-white px-3 py-2 text-sm text-flaque-ink outline-none ring-flaque-sand transition focus:ring-2"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>

          <div className="md:col-span-2">
            <button
              className="rounded-xl border border-flaque-clay bg-white px-4 py-2 text-sm text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={updatingPassword}
            >
              {updatingPassword ? "Saving..." : "Update password"}
            </button>
          </div>
        </form>

        {passwordMessage ? (
          <p
            className={`mt-3 rounded-xl px-3 py-2 text-sm ${
              passwordMessage.isError
                ? "border border-red-300 bg-red-50 text-red-700"
                : "border border-green-300 bg-green-50 text-green-700"
            }`}
          >
            {passwordMessage.text}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl m-4 border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-xl text-flaque-ink">Sessions</h3>

          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                void loadSessions();
              }}
              disabled={loadingSessions || revokingSessionId !== null || loggingOutOtherSessions}
            >
              Refresh
            </button>

            <button
              className="rounded-xl border border-flaque-clay bg-white px-3 py-1.5 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => {
                void handleLogoutOthers();
              }}
              disabled={!hasOtherSessions || loadingSessions || revokingSessionId !== null || loggingOutOtherSessions}
            >
              {loggingOutOtherSessions ? "Logging out..." : "Logout other devices"}
            </button>
          </div>
        </div>

        {loadingSessions ? <p className="mt-3 text-sm text-flaque-steel">Loading sessions...</p> : null}

        {!loadingSessions && sessions.length === 0 ? <p className="mt-3 text-sm text-flaque-steel">No active session.</p> : null}

        {!loadingSessions && sessions.length > 0 ? (
          <div className="mt-3 space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-flaque-clay/50 bg-flaque-cream/35 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-flaque-ink">
                    {getSessionTitle(session)}
                    {session.current ? (
                      <span className="ml-2 rounded-full bg-flaque-ink px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-flaque-cream">
                        Current
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-flaque-steel">
                    Last seen {formatSessionTimestamp(session.lastSeenAt)} - Expires {formatSessionTimestamp(session.expiresAt)}
                  </p>
                  {session.ipAddress ? <p className="truncate text-xs text-flaque-steel/90">IP: {session.ipAddress}</p> : null}
                </div>

                <button
                  className="rounded-lg border border-flaque-clay bg-white px-3 py-1 text-xs text-flaque-ink transition hover:bg-flaque-cream disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                  disabled={
                    session.current ||
                    loadingSessions ||
                    loggingOutOtherSessions ||
                    (revokingSessionId !== null && revokingSessionId !== session.id)
                  }
                  onClick={() => {
                    void handleRevokeSession(session.id);
                  }}
                >
                  {revokingSessionId === session.id ? "Revoking..." : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {sessionsMessage ? <p className="mt-3 text-sm text-flaque-steel">{sessionsMessage}</p> : null}
      </section>
    </div>
  );
}
