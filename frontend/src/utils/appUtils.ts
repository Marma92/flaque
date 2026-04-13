import type { AlbumEntry, Track } from "../types";
import { getTrackDisplayTitle } from "./tracks";

export type ViewName = "library" | "upload" | "player" | "config" | "account";

export type AppRoute = {
  view: ViewName;
  section: string | null;
  param: string | null;
};

export type StoredQueueSnapshot = {
  userId: string;
  trackIds: string[];
  currentTrackId: string | null;
};

/**
 * Check if an unknown value has the minimum shape of a track object.
 */
export function isTrackLike(value: unknown): value is Track {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    id?: unknown;
    owner?: unknown;
    path?: unknown;
    duration?: unknown;
    mimeType?: unknown;
    codec?: unknown;
    tags?: unknown;
  };

  return (
    typeof candidate.id === "string" &&
    typeof candidate.owner === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.duration === "number" &&
    typeof candidate.mimeType === "string" &&
    typeof candidate.codec === "string" &&
    Boolean(candidate.tags) &&
    typeof candidate.tags === "object"
  );
}

/**
 * Parse queue snapshot persisted in localStorage.
 */
export function parseStoredQueueSnapshot(value: unknown): StoredQueueSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    userId?: unknown;
    trackIds?: unknown;
    currentTrackId?: unknown;
  };

  if (typeof candidate.userId !== "string" || !candidate.userId.trim()) {
    return null;
  }

  if (!Array.isArray(candidate.trackIds)) {
    return null;
  }

  const deduplicated = new Set<string>();
  const trackIds: string[] = [];

  for (const entry of candidate.trackIds) {
    if (typeof entry !== "string") {
      continue;
    }

    const trimmed = entry.trim();
    if (!trimmed || deduplicated.has(trimmed)) {
      continue;
    }

    deduplicated.add(trimmed);
    trackIds.push(trimmed);
  }

  const currentTrackId =
    typeof candidate.currentTrackId === "string" && candidate.currentTrackId.trim()
      ? candidate.currentTrackId.trim()
      : null;

  return {
    userId: candidate.userId.trim(),
    trackIds,
    currentTrackId
  };
}

/**
 * Read and validate the persisted transcode mode.
 */
export function readTranscodeMode(storageKey: string): "original" | "opus" | "mp3" {
  if (typeof window === "undefined") {
    return "original";
  }

  const stored = window.localStorage.getItem(storageKey);
  if (stored === "opus" || stored === "mp3" || stored === "original") {
    return stored;
  }

  return "original";
}

/**
 * Read and validate the persisted shuffle mode.
 */
export function readShuffleMode(storageKey: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(storageKey) === "on";
}

/**
 * Find the previous or next track from an in-memory queue.
 */
export function getAdjacentTrackInQueue(
  queue: Track[],
  currentTrackId: string,
  direction: "next" | "previous",
  wrap = true
): Track | null {
  if (queue.length === 0) {
    return null;
  }

  const currentIndex = queue.findIndex((track) => track.id === currentTrackId);
  if (currentIndex < 0) {
    return null;
  }

  if (queue.length === 1) {
    return wrap ? queue[0] ?? null : null;
  }

  const offset = direction === "next" ? 1 : -1;
  const targetIndex = currentIndex + offset;

  if (targetIndex < 0 || targetIndex >= queue.length) {
    if (!wrap) {
      return null;
    }

    return direction === "next" ? queue[0] ?? null : queue[queue.length - 1] ?? null;
  }

  return queue[targetIndex] ?? null;
}

const PATH_MAP: Record<string, AppRoute> = {
  "": { view: "library", section: "home", param: null },
  "library": { view: "library", section: "home", param: null },
  "library/home": { view: "library", section: "home", param: null },
  "library/music": { view: "library", section: "music", param: null },
  "library/artists": { view: "library", section: "artists", param: null },
  "library/albums": { view: "library", section: "albums", param: null },
  "library/playlists": { view: "library", section: "playlists", param: null },
  "upload": { view: "upload", section: null, param: null },
  "player": { view: "player", section: null, param: null },
  "account": { view: "account", section: null, param: null },
  "settings": { view: "config", section: "index", param: null },
  "settings/index": { view: "config", section: "index", param: null },
  "settings/files": { view: "config", section: "files", param: null },
  "settings/users": { view: "config", section: "users", param: null },
  "settings/server": { view: "config", section: "server", param: null },
  "settings/backup": { view: "config", section: "backup", param: null }
};

const DYNAMIC_PREFIXES: Array<{ prefix: string; route: Omit<AppRoute, "param"> }> = [
  { prefix: "library/playlists/", route: { view: "library", section: "playlists" } }
];

const VALID_VIEWS = new Set<string>(["library", "upload", "player", "config", "account"]);

/**
 * Build a URL path for a given view and optional section.
 */
export function buildPathForRoute(view: ViewName, section?: string | null, param?: string | null): string {
  if (view === "library") {
    const s = section ?? "home";
    if (s === "playlists" && param) {
      return `/library/playlists/${encodeURIComponent(param)}`;
    }
    return s === "home" ? "/" : `/library/${s}`;
  }
  if (view === "config") {
    const s = section ?? "index";
    return s === "index" ? "/settings" : `/settings/${s}`;
  }
  return `/${view}`;
}

/**
 * Read the current app route from the URL pathname.
 * Handles legacy `?view=` query params by redirecting to the path equivalent.
 */
export function getRouteFromLocation(): AppRoute {
  if (typeof window === "undefined") {
    return { view: "library", section: "home", param: null };
  }

  const params = new URLSearchParams(window.location.search);
  const legacyView = params.get("view");
  if (legacyView && VALID_VIEWS.has(legacyView)) {
    params.delete("view");
    const search = params.toString() ? `?${params.toString()}` : "";
    const path = buildPathForRoute(legacyView as ViewName);
    window.history.replaceState(null, "", `${path}${search}${window.location.hash}`);
    return {
      view: legacyView as ViewName,
      section: legacyView === "config" ? "index" : legacyView === "library" ? "home" : null,
      param: null
    };
  }

  const raw = window.location.pathname.replace(/^\/+/, "").replace(/\/+$/, "");

  const exact = PATH_MAP[raw];
  if (exact) return exact;

  for (const { prefix, route } of DYNAMIC_PREFIXES) {
    if (raw.startsWith(prefix)) {
      const param = decodeURIComponent(raw.slice(prefix.length));
      if (param) return { ...route, param };
    }
  }

  return { view: "library", section: "home", param: null };
}

/**
 * Synchronize app route state to the URL pathname via replaceState.
 * Preserves existing query params and hash.
 */
export function syncRouteToLocation(view: ViewName, section?: string | null, param?: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  const targetPath = buildPathForRoute(view, section, param);
  if (window.location.pathname === targetPath) {
    return;
  }

  window.history.replaceState(null, "", `${targetPath}${window.location.search}${window.location.hash}`);
}

/**
 * Navigate to a route via pushState (adds a history entry for back/forward).
 * Preserves existing query params and hash.
 */
export function navigateTo(view: ViewName, section?: string | null, param?: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  const targetPath = buildPathForRoute(view, section, param);
  if (window.location.pathname === targetPath) {
    return;
  }

  window.history.pushState(null, "", `${targetPath}${window.location.search}${window.location.hash}`);
}

/**
 * Normalize text for case-insensitive comparisons.
 */
export function normalizeText(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Resolve a stable album key from either explicit id or textual identity.
 */
export function getAlbumKey(album: Pick<AlbumEntry, "id" | "name" | "artist">): string {
  const albumId = album.id?.trim();
  if (albumId) {
    return `id:${albumId}`;
  }

  return `${normalizeText(album.artist)}::${normalizeText(album.name)}`;
}

/**
 * Sort album tracks by disc, track number, then title.
 */
export function sortAlbumTracksByNumber(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => {
    const discA = a.tags.discNumber ?? Number.MAX_SAFE_INTEGER;
    const discB = b.tags.discNumber ?? Number.MAX_SAFE_INTEGER;
    if (discA !== discB) {
      return discA - discB;
    }

    const trackA = a.tags.trackNumber ?? Number.MAX_SAFE_INTEGER;
    const trackB = b.tags.trackNumber ?? Number.MAX_SAFE_INTEGER;
    if (trackA !== trackB) {
      return trackA - trackB;
    }

    return getTrackDisplayTitle(a).localeCompare(getTrackDisplayTitle(b));
  });
}
