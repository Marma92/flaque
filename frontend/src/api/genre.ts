import { requestJson } from "./client";

export type GenreSynonyms = Record<string, string>;

export async function getGenreSynonyms(): Promise<GenreSynonyms> {
  return requestJson<GenreSynonyms>("/api/genre/synonyms");
}

export async function putGenreSynonym(key: string, value: string): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/genre/synonyms", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: key, to: value })
  });
}

export async function deleteGenreSynonym(key: string): Promise<void> {
  await requestJson<void>(`/api/genre/synonyms/${encodeURIComponent(key)}`, {
    method: "DELETE",
    skipJson: true
  });
}

export async function resetGenreSynonyms(): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/genre/synonyms/reset", { method: "POST" });
}

export type EnrichmentCurrentTrack = {
  trackId: string;
  artist: string;
  title: string;
};

export type EnrichmentStatus = {
  running: boolean;
  processed: number;
  total: number;
  enriched: number;
  failed: number;
  startedAt: string | null;
  currentTrack: EnrichmentCurrentTrack | null;
};

export async function getEnrichmentStatus(): Promise<EnrichmentStatus> {
  return requestJson<EnrichmentStatus>("/api/genre/enrichment/status");
}

export async function startEnrichment(): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/genre/enrichment/start", { method: "POST" });
}

export async function stopEnrichment(): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/genre/enrichment/stop", { method: "POST" });
}

export type EnrichmentLogEntry = {
  timestamp: string;
  trackId: string;
  artist: string;
  title: string;
  source: "bulk" | "single" | "upload";
  status: "hit" | "miss" | "skipped" | "failed";
  filledGenre?: string[];
  filledYear?: number;
  filledRecordingMbid?: string;
  filledReleaseGroupMbid?: string;
  filledArtistMbid?: string;
  coverFetched?: boolean;
  errorMessage?: string;
};

export async function getEnrichmentLog(limit = 100): Promise<EnrichmentLogEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const payload = await requestJson<{ entries: EnrichmentLogEntry[] }>(
    `/api/genre/enrichment/log?${params.toString()}`
  );
  return payload.entries;
}

export async function clearEnrichmentLog(): Promise<void> {
  await requestJson<{ cleared: boolean }>("/api/genre/enrichment/log", { method: "DELETE" });
}

export type ReEnrichResult = {
  trackId: string;
  result: {
    genres: string[] | null;
    year: number | null;
    mbidRecording: string | null;
    mbidReleaseGroup: string | null;
    mbidArtist: string | null;
    coverFetched: boolean;
  };
};

export async function reEnrichTrack(trackId: string): Promise<ReEnrichResult> {
  return requestJson<ReEnrichResult>(`/api/genre/enrichment/track/${encodeURIComponent(trackId)}`, {
    method: "POST"
  });
}

export async function reapplyGenreSynonyms(): Promise<{ scanned: number; updated: number }> {
  return requestJson<{ scanned: number; updated: number }>("/api/genre/synonyms/reapply", {
    method: "POST"
  });
}

export type LibraryGenreLabel = {
  label: string;
  count: number;
  canonical?: string;
};

export async function getLibraryGenreLabels(): Promise<LibraryGenreLabel[]> {
  const payload = await requestJson<{ labels: LibraryGenreLabel[] }>("/api/genre/library-labels");
  return payload.labels;
}

export type GenreCacheStats = {
  entries: number;
  fingerprints?: number;
  acoustid?: number;
  acoustIdConfigured?: boolean;
  fingerprintingAvailable?: boolean;
};

export async function getGenreCacheStats(): Promise<GenreCacheStats> {
  return requestJson<GenreCacheStats>("/api/genre/cache/stats");
}

export async function clearGenreCache(): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/genre/cache/clear", { method: "POST" });
}
