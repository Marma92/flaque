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

export type EnrichmentStatus = {
  running: boolean;
  processed: number;
  total: number;
  enriched: number;
  failed: number;
  startedAt: string | null;
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

export type GenreCacheStats = {
  entries: number;
};

export async function getGenreCacheStats(): Promise<GenreCacheStats> {
  return requestJson<GenreCacheStats>("/api/genre/cache/stats");
}

export async function clearGenreCache(): Promise<void> {
  await requestJson<{ ok: boolean }>("/api/genre/cache/clear", { method: "POST" });
}
