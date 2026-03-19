import { useEffect, useState } from "react";

import { getUsers } from "../api";
import type { User } from "../types";

type UseAdminUsersArgs = {
  user: User | null;
};

type UseAdminUsersResult = {
  adminUsers: User[];
  loadingAdminUsers: boolean;
  adminError: string | null;
  refreshAdminUsers: () => Promise<void>;
  clearAdminState: () => void;
};

/**
 * Admin-only user list lifecycle and manual refresh action.
 */
export function useAdminUsers({ user }: UseAdminUsersArgs): UseAdminUsersResult {
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [loadingAdminUsers, setLoadingAdminUsers] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role !== "admin") {
      return;
    }

    setLoadingAdminUsers(true);
    setAdminError(null);

    getUsers()
      .then((users) => {
        setAdminUsers(users);
      })
      .catch((error) => {
        setAdminError(error instanceof Error ? error.message : "Failed to load users");
      })
      .finally(() => {
        setLoadingAdminUsers(false);
      });
  }, [user]);

  async function refreshAdminUsers(): Promise<void> {
    setLoadingAdminUsers(true);
    setAdminError(null);
    try {
      const users = await getUsers();
      setAdminUsers(users);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Failed to load users");
    } finally {
      setLoadingAdminUsers(false);
    }
  }

  function clearAdminState(): void {
    setAdminUsers([]);
    setAdminError(null);
  }

  return {
    adminUsers,
    loadingAdminUsers,
    adminError,
    refreshAdminUsers,
    clearAdminState
  };
}
