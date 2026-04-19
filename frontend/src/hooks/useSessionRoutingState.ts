import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { getCurrentUser, login, setUnauthorizedHandler } from "../api";
import type { ConfigSection } from "../components/ConfigView";
import type { User } from "../types";
import type { LibrarySection } from "../types/library";
import { getRouteFromLocation, syncRouteToLocation, type ViewName } from "../utils/appUtils";

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
  activeConfigSection: ConfigSection;
  setActiveConfigSection: Dispatch<SetStateAction<ConfigSection>>;
  playlistDetailId: string | null;
  setPlaylistDetailId: Dispatch<SetStateAction<string | null>>;
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
  const [activeView, setActiveView] = useState<ViewName>(() => getRouteFromLocation().view);
  const [activeLibrarySection, setActiveLibrarySection] = useState<LibrarySection>(() => {
    const route = getRouteFromLocation();
    return route.view === "library" && route.section
      ? (route.section as LibrarySection)
      : "home";
  });
  const [activeConfigSection, setActiveConfigSection] = useState<ConfigSection>(() => {
    const route = getRouteFromLocation();
    return route.view === "config" && route.section
      ? (route.section as ConfigSection)
      : "index";
  });
  const [playlistDetailId, setPlaylistDetailId] = useState<string | null>(() => {
    const route = getRouteFromLocation();
    return route.view === "library" && route.section === "playlists" ? route.param : null;
  });

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
    setUnauthorizedHandler(() => {
      setUser(null);
      notifyAuthStateChanged("logout");
    });
    return () => {
      setUnauthorizedHandler(null);
    };
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
      const route = getRouteFromLocation();

      if (route.view === "config" && user?.role !== "admin") {
        setActiveView("library");
        return;
      }

      setActiveView(route.view);

      if (route.view === "library" && route.section) {
        setActiveLibrarySection(route.section as LibrarySection);
        setPlaylistDetailId(route.section === "playlists" ? route.param : null);
      } else {
        setPlaylistDetailId(null);
      }
      if (route.view === "config" && route.section) {
        setActiveConfigSection(route.section as ConfigSection);
      }
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

    const section = resolvedView === "library"
      ? activeLibrarySection
      : resolvedView === "config"
        ? activeConfigSection
        : null;
    const param = resolvedView === "library" && activeLibrarySection === "playlists"
      ? playlistDetailId
      : null;
    syncRouteToLocation(resolvedView, section, param);
  }, [activeView, activeLibrarySection, activeConfigSection, playlistDetailId, sessionChecked, user?.role]);

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
    activeConfigSection,
    setActiveConfigSection,
    playlistDetailId,
    setPlaylistDetailId,
    handleLogin,
    notifyAuthStateChanged
  };
}
