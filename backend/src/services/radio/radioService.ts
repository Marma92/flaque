import { randomUUID } from "node:crypto";

import type { IndexStore } from "../indexer/indexStore";
import type { Track } from "../../types/library";
import { getTrackArtistName, normalizeIndexKey } from "../../utils/music";

export const RADIO_MAX_TRACKS = 10;
const MIN_TRACK_DURATION_SEC = 60;
const RECENT_ARTIST_WINDOW = 3;

export type RadioTrack = {
  trackId: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  durationSec: number;
  startsAt: string;
  endsAt: string;
  coverUrl?: string | null;
  streamUrl: string;
};

export type RadioStation = {
  id: string;
  createdAt: string;
  status: "running";
  trackList: RadioTrack[];
};

export type RadioStationNowPlaying = {
  id: string;
  currentTrack: RadioTrack | null;
  nextTrack: RadioTrack | null;
};

export type RadioCreateResponse = {
  serverNow: string;
  success: boolean;
  message: string;
  station: RadioStationNowPlaying | null;
};

export type RadioStateResponse = {
  serverNow: string;
  status: "running" | "stopped";
  station: RadioStationNowPlaying | null;
};

export type RadioQueueResponse = {
  serverNow: string;
  station: {
    id: string;
    trackList: RadioTrack[];
  } | null;
};

type IndexedTrack = {
  trackId: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  durationSec: number;
  ownerKey: string;
  coverUrl: string | null;
  streamUrl: string;
};

let activeStation: RadioStation | null = null;

class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(work: () => T | Promise<T>): Promise<T> {
    const current = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await current;
    try {
      return await work();
    } finally {
      release();
    }
  }
}

const stationMutationMutex = new AsyncMutex();

function toIso(input: Date): string {
  return input.toISOString();
}

function parseDurationSec(rawDuration: unknown): number | null {
  if (typeof rawDuration !== "number" || !Number.isFinite(rawDuration)) {
    return null;
  }

  if (rawDuration < MIN_TRACK_DURATION_SEC) {
    return null;
  }

  return Math.max(1, Math.round(rawDuration));
}

function normalizeOwner(owner: string): string {
  return normalizeIndexKey(owner) || "unknown-owner";
}

function toIndexedTrack(track: Track): IndexedTrack | null {
  const durationSec = parseDurationSec(track.duration);
  if (durationSec === null) {
    return null;
  }

  return {
    trackId: track.id,
    title: track.tags.title ?? null,
    artist: getTrackArtistName(track) ?? null,
    album: track.tags.album ?? null,
    durationSec,
    ownerKey: normalizeOwner(track.owner),
    coverUrl: track.cover ?? `/api/covers/${track.id}`,
    streamUrl: `/api/tracks/${track.id}/stream`
  };
}

function createTrackListTimeline(startAt: Date, tracks: IndexedTrack[]): RadioTrack[] {
  let cursorMs = startAt.getTime();

  return tracks.map((track) => {
    const startsAt = new Date(cursorMs);
    cursorMs += track.durationSec * 1_000;
    const endsAt = new Date(cursorMs);

    return {
      trackId: track.trackId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      durationSec: track.durationSec,
      startsAt: toIso(startsAt),
      endsAt: toIso(endsAt),
      coverUrl: track.coverUrl,
      streamUrl: track.streamUrl
    };
  });
}

function trackAlreadyRecent(selected: IndexedTrack[], artist: string | null): boolean {
  if (!artist) {
    return false;
  }

  const normalizedArtist = normalizeIndexKey(artist);
  if (!normalizedArtist) {
    return false;
  }

  const recent = selected.slice(Math.max(0, selected.length - RECENT_ARTIST_WINDOW));
  return recent.some((track) => normalizeIndexKey(track.artist ?? "") === normalizedArtist);
}

function ownerPenalty(selected: IndexedTrack[], ownerKey: string): number {
  let repeats = 0;
  for (const track of selected) {
    if (track.ownerKey === ownerKey) {
      repeats += 1;
    }
  }
  return repeats * 20;
}

function pickBestCandidate(remaining: IndexedTrack[], selected: IndexedTrack[]): IndexedTrack {
  const previous = selected[selected.length - 1] ?? null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestCandidates: IndexedTrack[] = [];

  for (const candidate of remaining) {
    let score = 100;

    if (previous) {
      const sameArtist =
        previous.artist !== null &&
        candidate.artist !== null &&
        normalizeIndexKey(previous.artist) === normalizeIndexKey(candidate.artist);
      const sameAlbum =
        previous.album !== null &&
        candidate.album !== null &&
        normalizeIndexKey(previous.album) === normalizeIndexKey(candidate.album);

      if (sameArtist) {
        score -= 1_000;
      }
      if (sameAlbum) {
        score -= 500;
      }
      if (previous.ownerKey === candidate.ownerKey) {
        score -= 80;
      }
    }

    if (trackAlreadyRecent(selected, candidate.artist)) {
      score -= 250;
    }

    score -= ownerPenalty(selected, candidate.ownerKey);

    score += Math.random() * 40;

    if (score > bestScore) {
      bestScore = score;
      bestCandidates = [candidate];
      continue;
    }

    if (score === bestScore) {
      bestCandidates.push(candidate);
    }
  }

  const winnerIndex = Math.floor(Math.random() * bestCandidates.length);
  return bestCandidates[winnerIndex] ?? remaining[0]!;
}

/**
 * Smart radio shuffle strategy:
 * 1) Filter out invalid tracks (missing duration or shorter than MIN_TRACK_DURATION_SEC).
 * 2) Shuffle candidates then perform iterative constrained selection.
 * 3) Penalize same artist/album as previous track and artists that appeared recently.
 * 4) Penalize owner repetitions to spread owners when possible.
 * 5) Add a random tie-breaker so two creations do not always produce the same list.
 * 6) On rebuild, first try to avoid any overlap with the previous station track IDs.
 * 7) Fallback to full pool if the library is too small.
 */
function buildSmartTrackList(options: {
  allTracks: Track[];
  maxTracks: number;
  excludedTrackIds: Set<string>;
}): IndexedTrack[] {
  const allCandidates = options.allTracks
    .map(toIndexedTrack)
    .filter((track): track is IndexedTrack => track !== null);

  const selected: IndexedTrack[] = [];
  const selectedIds = new Set<string>();
  const primaryPool = allCandidates.filter((track) => !options.excludedTrackIds.has(track.trackId));

  const selectFromPool = (pool: IndexedTrack[]): void => {
    const remaining: IndexedTrack[] = [...pool];

    while (selected.length < options.maxTracks && remaining.length > 0) {
      const next = pickBestCandidate(remaining, selected);
      const nextIndex = remaining.findIndex((track) => track.trackId === next.trackId);
      if (nextIndex >= 0) {
        remaining.splice(nextIndex, 1);
      }

      if (selectedIds.has(next.trackId)) {
        continue;
      }

      selected.push(next);
      selectedIds.add(next.trackId);
    }
  };

  selectFromPool(primaryPool);
  if (selected.length < options.maxTracks) {
    selectFromPool(allCandidates);
  }

  return selected;
}

function getTrackAtTime(trackList: RadioTrack[], now: Date): { currentTrack: RadioTrack | null; nextTrack: RadioTrack | null } {
  const nowMs = now.getTime();
  if (trackList.length === 0) {
    return { currentTrack: null, nextTrack: null };
  }

  for (let index = 0; index < trackList.length; index += 1) {
    const track = trackList[index]!;
    const startsAtMs = Date.parse(track.startsAt);
    const endsAtMs = Date.parse(track.endsAt);

    if (nowMs >= startsAtMs && nowMs < endsAtMs) {
      return {
        currentTrack: track,
        nextTrack: trackList[index + 1] ?? null
      };
    }

    if (nowMs < startsAtMs) {
      return {
        currentTrack: null,
        nextTrack: track
      };
    }
  }

  return { currentTrack: null, nextTrack: null };
}

function summarizeStation(station: RadioStation, now: Date): RadioStationNowPlaying {
  const { currentTrack, nextTrack } = getTrackAtTime(station.trackList, now);
  return {
    id: station.id,
    currentTrack,
    nextTrack
  };
}

function hasStationExpired(station: RadioStation, now: Date): boolean {
  const lastTrack = station.trackList[station.trackList.length - 1];
  if (!lastTrack) {
    return true;
  }
  return now.getTime() >= Date.parse(lastTrack.endsAt);
}

function invalidateExpiredStation(now: Date): void {
  if (!activeStation) {
    return;
  }

  if (hasStationExpired(activeStation, now)) {
    activeStation = null;
  }
}

export class RadioService {
  constructor(private readonly indexStore: IndexStore) {}

  async createStation(): Promise<RadioCreateResponse> {
    return stationMutationMutex.runExclusive(async () => {
      const now = new Date();
      invalidateExpiredStation(now);

      const nextStation = this.buildStation(now, new Set<string>());
      const serverNow = toIso(now);

      if (!nextStation) {
        activeStation = null;
        return {
          serverNow,
          success: false,
          message: "No eligible tracks available to create a radio station",
          station: null
        };
      }

      activeStation = nextStation;
      return {
        serverNow,
        success: true,
        message: "Radio station created",
        station: summarizeStation(nextStation, now)
      };
    });
  }

  async getState(): Promise<RadioStateResponse> {
    return stationMutationMutex.runExclusive(async () => {
      const now = new Date();
      invalidateExpiredStation(now);

      if (!activeStation) {
        return {
          serverNow: toIso(now),
          status: "stopped",
          station: null
        };
      }

      return {
        serverNow: toIso(now),
        status: "running",
        station: summarizeStation(activeStation, now)
      };
    });
  }

  async getQueue(): Promise<RadioQueueResponse> {
    return stationMutationMutex.runExclusive(async () => {
      const now = new Date();
      invalidateExpiredStation(now);

      if (!activeStation) {
        return {
          serverNow: toIso(now),
          station: null
        };
      }

      return {
        serverNow: toIso(now),
        station: {
          id: activeStation.id,
          trackList: activeStation.trackList
        }
      };
    });
  }

  async rebuildStation(stationId: string): Promise<RadioCreateResponse> {
    return stationMutationMutex.runExclusive(async () => {
      const now = new Date();
      invalidateExpiredStation(now);

      if (!activeStation) {
        return {
          serverNow: toIso(now),
          success: false,
          message: "Cannot rebuild radio station: no active station",
          station: null
        };
      }

      if (activeStation.id !== stationId) {
        return {
          serverNow: toIso(now),
          success: false,
          message: `Cannot rebuild radio station: stationId mismatch (expected ${activeStation.id})`,
          station: summarizeStation(activeStation, now)
        };
      }

      const previousTrackIds = new Set(activeStation.trackList.map((track) => track.trackId));
      const nextStation = this.buildStation(now, previousTrackIds);
      if (!nextStation) {
        activeStation = null;
        return {
          serverNow: toIso(now),
          success: false,
          message: "Cannot rebuild radio station: no eligible tracks available",
          station: null
        };
      }

      activeStation = nextStation;
      return {
        serverNow: toIso(now),
        success: true,
        message: "Radio station rebuilt",
        station: summarizeStation(nextStation, now)
      };
    });
  }

  private buildStation(now: Date, excludedTrackIds: Set<string>): RadioStation | null {
    const allTracks = this.indexStore.getSnapshot().tracks;
    const selectedTracks = buildSmartTrackList({
      allTracks,
      maxTracks: RADIO_MAX_TRACKS,
      excludedTrackIds
    });

    if (selectedTracks.length === 0) {
      return null;
    }

    return {
      id: randomUUID(),
      createdAt: toIso(now),
      status: "running",
      trackList: createTrackListTimeline(now, selectedTracks)
    };
  }
}

export function resetRadioStateForTests(): void {
  activeStation = null;
}
