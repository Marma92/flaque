import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { getCurrentUser, login } from "../api";
import type { User } from "../types";
import type { LibrarySection } from "../types/library";
import { getViewFromLocation, syncViewToLocation, type ViewName } from "../utils/appUtils";

const VIEW_QUERY_PARAM = "view";

type UseSessionRoutingStateResult = {
  user: User | null;
  setUser: Dispatch<SetStateAction<User | null>>;
  sessionChecked: boolean;
  activeView: ViewName;
  setActiveView: Dispatch<SetStateAction<ViewName>>;
  activeLibrarySection: LibrarySection;
  setActiveLibrarySection: Dispatch<SetStateAction<LibrarySection>>;
  handleLogin: (username: string, password: string) => Promise<void>;
};

/**
 * Owns auth session bootstrap and URL/view synchronization.
 */
export function useSessionRoutingState(): UseSessionRoutingStateResult {
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [activeView, setActiveView] = useState<ViewName>(() => getViewFromLocation(VIEW_QUERY_PARAM));
  const [activeLibrarySection, setActiveLibrarySection] = useState<LibrarySection>("music");

  useEffect(() => {
    getCurrentUser()
      .then((nextUser) => {
        setUser(nextUser);
      })
      .finally(() => setSessionChecked(true));
  }, []);

  useEffect(() => {
    if (!user || user.role === "admin") {
      return;
    }

    if (activeView === "config") {
      setActiveView("library");
    }
  }, [activeView, user]);

  useEffect(() => {
    const onPopState = () => {
      const requestedView = getViewFromLocation(VIEW_QUERY_PARAM);
      if (requestedView === "config" && user?.role !== "admin") {
        setActiveView("library");
        return;
      }

      setActiveView(requestedView);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [user?.role]);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }

    const resolvedView = activeView === "config" && user?.role !== "admin" ? "library" : activeView;
    if (resolvedView !== activeView) {
      setActiveView(resolvedView);
      return;
    }

    syncViewToLocation(resolvedView, VIEW_QUERY_PARAM);
  }, [activeView, sessionChecked, user?.role]);

  async function handleLogin(username: string, password: string): Promise<void> {
    const authenticatedUser = await login(username, password);
    setUser(authenticatedUser);
    setActiveView("library");
    setActiveLibrarySection("music");
  }

  return {
    user,
    setUser,
    sessionChecked,
    activeView,
    setActiveView,
    activeLibrarySection,
    setActiveLibrarySection,
    handleLogin
  };
}
