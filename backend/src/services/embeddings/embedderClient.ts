/**
 * Node-side client for the audio-embedder Python sidecar.
 *
 * Phase 1: protocol-only. The production embedding path
 * (`computeAndSaveEmbedding`) still uses the in-process DSP pipeline in
 * `audioFeatures.ts`. This client exists so we can exercise the wire format
 * end-to-end (via `npm run embed:probe`) before phase 3 swaps the production
 * call site over.
 *
 * Best-effort semantics match the rest of the embedding pipeline:
 * any failure (network, timeout, bad status, malformed body) returns `null`
 * and logs a warning — the caller is expected to fall back gracefully.
 */
import { createLogger } from "../../utils/logger";

const log = createLogger("embedder-client");

const DEFAULT_BASE_URL = "http://127.0.0.1:7001";
const DEFAULT_TIMEOUT_MS = 10_000;

export type EmbedderResponse = {
  vec: number[];
  dim: number;
  model: string;
};

export type EmbedderHealth = {
  ok: boolean;
  model: string;
};

function baseUrl(): string {
  const raw = (process.env.AUDIO_EMBEDDER_URL ?? "").trim();
  return raw.length > 0 ? raw.replace(/\/+$/, "") : DEFAULT_BASE_URL;
}

function timeoutMs(): number {
  const raw = Number(process.env.AUDIO_EMBEDDER_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isValidEmbedderResponse(body: unknown): body is EmbedderResponse {
  if (!body || typeof body !== "object") return false;
  const r = body as Record<string, unknown>;
  if (!Array.isArray(r.vec)) return false;
  if (typeof r.dim !== "number") return false;
  if (typeof r.model !== "string") return false;
  if (r.vec.length !== r.dim) return false;
  for (const v of r.vec) {
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
  }
  return true;
}

/**
 * Ask the sidecar for an embedding of the file at `absolutePath`.
 *
 * The sidecar reads the file directly (same host), so we send only the path
 * rather than the audio bytes. Returns null on any failure.
 */
export async function requestEmbedding(absolutePath: string): Promise<EmbedderResponse | null> {
  if (!absolutePath) {
    log.warn("requestEmbedding called with empty path");
    return null;
  }

  const url = `${baseUrl()}/embed`;
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ absolutePath })
    });
  } catch (error) {
    log.warn("Embedder request failed", { url, error: String(error) });
    return null;
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 200);
    } catch {
      // ignore — we'll log status only
    }
    log.warn("Embedder returned non-OK status", { status: response.status, detail });
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    log.warn("Embedder returned non-JSON body", { error: String(error) });
    return null;
  }

  if (!isValidEmbedderResponse(body)) {
    log.warn("Embedder returned malformed body", { body });
    return null;
  }

  return body;
}

/**
 * Check the sidecar is reachable. Returns null when the health check fails,
 * which is treated by callers as "fall back to in-process embedding".
 */
export async function pingEmbedder(): Promise<EmbedderHealth | null> {
  const url = `${baseUrl()}/healthz`;
  let response: Response;
  try {
    response = await fetchWithTimeout(url, { method: "GET" });
  } catch (error) {
    log.debug("Embedder health check failed", { url, error: String(error) });
    return null;
  }
  if (!response.ok) {
    log.debug("Embedder health check non-OK", { status: response.status });
    return null;
  }
  try {
    const body = (await response.json()) as Partial<EmbedderHealth>;
    if (typeof body.ok !== "boolean" || typeof body.model !== "string") return null;
    return { ok: body.ok, model: body.model };
  } catch (error) {
    log.debug("Embedder health body malformed", { error: String(error) });
    return null;
  }
}
