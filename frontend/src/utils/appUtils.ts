import type { AlbumEntry, Track } from "../types";
import { getTrackDisplayTitle } from "./tracks";

export type ViewName = "library" | "upload" | "player" | "config";

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

/**
 * Parse and validate the URL `view` query parameter.
 */
export function parseViewParam(rawValue: string | null): ViewName | null {
  if (rawValue === "library" || rawValue === "upload" || rawValue === "player" || rawValue === "config") {
    return rawValue;
  }

  return null;
}

/**
 * Read the current app view from location query params.
 */
export function getViewFromLocation(queryParam: string): ViewName {
  if (typeof window === "undefined") {
    return "library";
  }

  const view = parseViewParam(new URLSearchParams(window.location.search).get(queryParam));
  return view ?? "library";
}

/**
 * Synchronize app view state to the location query params.
 */
export function syncViewToLocation(view: ViewName, queryParam: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get(queryParam) === view) {
    return;
  }

  url.searchParams.set(queryParam, view);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
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
