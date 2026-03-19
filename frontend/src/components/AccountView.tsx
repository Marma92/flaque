import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { User } from "../types";

type AccountViewProps = {
  user: User;
  avatarUrl: string;
  onUpdatePhoto: (file: File) => Promise<void>;
  onChangePassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
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
export function AccountView({ user, avatarUrl, onUpdatePhoto, onChangePassword, onLogout }: AccountViewProps): JSX.Element {
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [selectedPhotoPreviewUrl, setSelectedPhotoPreviewUrl] = useState<string | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

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
      setPasswordMessage("Current and new password are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage("Password confirmation does not match.");
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
      setPasswordMessage("Password updated.");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "Unable to update password");
    } finally {
      setUpdatingPassword(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-flaque-steel">Account</p>
            <h2 className="mt-1 font-display text-2xl text-flaque-ink">Your Profile</h2>
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

      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
        <h3 className="font-display text-xl text-flaque-ink">Identity</h3>

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

      <section className="rounded-3xl border border-flaque-clay/60 bg-white/85 p-5 shadow-panel backdrop-blur-sm">
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

        {passwordMessage ? <p className="mt-3 text-sm text-flaque-steel">{passwordMessage}</p> : null}
      </section>
    </div>
  );
}
