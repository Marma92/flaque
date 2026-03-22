import type { Dispatch, SetStateAction } from "react";

import {
  createUserAccount,
  deleteUserAccount,
  patchUserAccount,
  resetUserPassword
} from "../api";
import type { User } from "../types";
import type { ViewName } from "../utils/appUtils";

type UseAdminCommandsArgs = {
  user: User | null;
  setUser: Dispatch<SetStateAction<User | null>>;
  setActiveView: Dispatch<SetStateAction<ViewName>>;
  clearAdminState: () => void;
  refreshAdminUsers: () => Promise<void>;
};

type UseAdminCommandsResult = {
  handleCreateUser: (input: {
    username: string;
    password: string;
    email: string;
    role: "user" | "admin";
  }) => Promise<void>;
  handleDeleteUser: (userId: string) => Promise<void>;
  handleResetUserPassword: (userId: string, password: string) => Promise<void>;
  handlePatchUser: (input: {
    userId: string;
    username?: string;
    email?: string;
    role?: "user" | "admin";
  }) => Promise<void>;
};

/**
 * Admin account management commands with current-user safeguards.
 */
export function useAdminCommands({
  user,
  setUser,
  setActiveView,
  clearAdminState,
  refreshAdminUsers
}: UseAdminCommandsArgs): UseAdminCommandsResult {
  async function handleCreateUser(input: {
    username: string;
    password: string;
    email: string;
    role: "user" | "admin";
  }): Promise<void> {
    await createUserAccount(input);
    await refreshAdminUsers();
  }

  async function handleDeleteUser(userId: string): Promise<void> {
    await deleteUserAccount(userId);
    await refreshAdminUsers();
  }

  async function handleResetUserPassword(userId: string, password: string): Promise<void> {
    await resetUserPassword(userId, password);
  }

  async function handlePatchUser(input: {
    userId: string;
    username?: string;
    email?: string;
    role?: "user" | "admin";
  }): Promise<void> {
    const patchedUser = await patchUserAccount(input.userId, {
      username: input.username,
      email: input.email,
      role: input.role
    });

    if (user && patchedUser.id === user.id) {
      setUser(patchedUser);

      if (patchedUser.role !== "admin") {
        setActiveView("library");
        clearAdminState();
        return;
      }
    }

    await refreshAdminUsers();
  }

  return {
    handleCreateUser,
    handleDeleteUser,
    handleResetUserPassword,
    handlePatchUser
  };
}
