import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  getMySessions,
  logoutOtherSessions,
  revokeMySession,
  updateMyEmail,
  updateMyPassword,
  uploadMyProfilePhoto
} from "../api";
import type { AppNotice } from "../components/AppStatusBanners";

type UseAccountActionsArgs = {
  notifyAuthStateChanged: (kind: "login" | "logout" | "session-change") => void;
  setAppNotice: Dispatch<SetStateAction<AppNotice | null>>;
  setAvatarVersion: Dispatch<SetStateAction<number>>;
  setUser: Dispatch<SetStateAction<import("../types").User | null>>;
};

type UseAccountActionsResult = {
  handleUpdateProfilePhoto: (file: File) => Promise<void>;
  handleUpdateEmail: (email: string) => Promise<void>;
  handleUpdateOwnPassword: (input: { currentPassword: string; newPassword: string }) => Promise<void>;
  handleListMySessions: () => ReturnType<typeof getMySessions>;
  handleRevokeMySession: (sessionId: string) => Promise<void>;
  handleLogoutOtherSessions: () => Promise<number>;
};

/**
 * Account management actions (profile photo, password, sessions).
 */
export function useAccountActions({
  notifyAuthStateChanged,
  setAppNotice,
  setAvatarVersion,
  setUser
}: UseAccountActionsArgs): UseAccountActionsResult {
  const handleUpdateProfilePhoto = useCallback(
    async (file: File): Promise<void> => {
      await uploadMyProfilePhoto(file);
      setAvatarVersion((current) => current + 1);
      setAppNotice({ tone: "success", message: "Profile photo updated" });
    },
    [setAvatarVersion, setAppNotice]
  );

  const handleUpdateEmail = useCallback(
    async (email: string): Promise<void> => {
      const updatedUser = await updateMyEmail(email);
      setUser(updatedUser);
      setAppNotice({ tone: "success", message: "Email updated" });
    },
    [setUser, setAppNotice]
  );

  const handleUpdateOwnPassword = useCallback(
    async (input: { currentPassword: string; newPassword: string }): Promise<void> => {
      await updateMyPassword(input);
      notifyAuthStateChanged("session-change");
      setAppNotice({ tone: "success", message: "Password updated" });
    },
    [notifyAuthStateChanged, setAppNotice]
  );

  const handleListMySessions = useCallback(async () => {
    return getMySessions();
  }, []);

  const handleRevokeMySession = useCallback(
    async (sessionId: string): Promise<void> => {
      await revokeMySession(sessionId);
      notifyAuthStateChanged("session-change");
      setAppNotice({ tone: "success", message: "Session revoked" });
    },
    [notifyAuthStateChanged, setAppNotice]
  );

  const handleLogoutOtherSessions = useCallback(async (): Promise<number> => {
    const result = await logoutOtherSessions();
    notifyAuthStateChanged("session-change");
    setAppNotice({
      tone: "success",
      message: `${result.revoked} session${result.revoked === 1 ? "" : "s"} logged out`
    });
    return result.revoked;
  }, [notifyAuthStateChanged, setAppNotice]);

  return {
    handleUpdateProfilePhoto,
    handleUpdateEmail,
    handleUpdateOwnPassword,
    handleListMySessions,
    handleRevokeMySession,
    handleLogoutOtherSessions
  };
}
