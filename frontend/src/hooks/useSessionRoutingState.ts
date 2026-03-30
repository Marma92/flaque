import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { getCurrentUser, login } from "../api";
import type { User } from "../types";
import type { LibrarySection } from "../types/library";
import { getViewFromLocation, syncViewToLocation, type ViewName } from "../utils/appUtils";

const VIEW_QUERY_PARAM = "view";
const AUTH_SYNC_CHANNEL = "flaque-auth-sync-v1";
const AUTH_SYNC_STORAGE_KEY = "flaque_auth_sync_v1";

type AuthSyncEvent = {
  sourceId: string;
  kind: "login" | "logout" | "session-change";
  at: number;
};

type UseSessionRoutingStateResult = {
  user: User | null;
  setUser: Dispatch<SetStateAction<User | null>>;
  sessionChecked: boolean;
  activeView: ViewName;
  setActiveView: Dispatch<SetStateAction<ViewName>>;
  activeLibrarySection: LibrarySection;
  setActiveLibrarySection: Dispatch<SetStateAction<LibrarySection>>;
  handleLogin: (login: string, password: string) => Promise<void>;
  notifyAuthStateChanged: (kind: AuthSyncEvent["kind"]) => void;
};

function createTabId(): string {
  const random = Math.random().toString(36).slice(2, 12);
  return `tab-${Date.now().toString(36)}-${random}`;
}

/**
 * Owns auth session bootstrap and URL/view synchronization.
 */
export function useSessionRoutingState(): UseSessionRoutingStateResult {
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [activeView, setActiveView] = useState<ViewName>(() => getViewFromLocation(VIEW_QUERY_PARAM));
  const [activeLibrarySection, setActiveLibrarySection] = useState<LibrarySection>("home");

  const sourceIdRef = useRef(createTabId());
  const channelRef = useRef<BroadcastChannel | null>(null);

  async function refreshCurrentSession(): Promise<void> {
    const nextUser = await getCurrentUser();
    setUser(nextUser);
    setSessionChecked(true);
  }

  function notifyAuthStateChanged(kind: AuthSyncEvent["kind"]): void {
    const payload: AuthSyncEvent = {
      sourceId: sourceIdRef.current,
      kind,
      at: Date.now()
    };

    if (channelRef.current) {
      channelRef.current.postMessage(payload);
      return;
    }

    try {
      window.localStorage.setItem(AUTH_SYNC_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore localStorage write issues in restricted environments
    }
  }

  useEffect(() => {
    void refreshCurrentSession();
  }, []);

  useEffect(() => {
    const handleSyncEvent = (event: AuthSyncEvent) => {
      if (!event || event.sourceId === sourceIdRef.current) {
        return;
      }

      void refreshCurrentSession();
    };

    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
      channelRef.current = channel;

      channel.onmessage = (event: MessageEvent<AuthSyncEvent>) => {
        handleSyncEvent(event.data);
      };

      return () => {
        channel.close();
        channelRef.current = null;
      };
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_SYNC_STORAGE_KEY || !event.newValue) {
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue) as AuthSyncEvent;
        handleSyncEvent(parsed);
      } catch {
        // ignore malformed sync payloads
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
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

  async function handleLogin(loginValue: string, password: string): Promise<void> {
    const authenticatedUser = await login(loginValue, password);
    setUser(authenticatedUser);
    setActiveView("library");
    setActiveLibrarySection("home");
    notifyAuthStateChanged("login");
  }

  return {
    user,
    setUser,
    sessionChecked,
    activeView,
    setActiveView,
    activeLibrarySection,
    setActiveLibrarySection,
    handleLogin,
    notifyAuthStateChanged
  };
}
