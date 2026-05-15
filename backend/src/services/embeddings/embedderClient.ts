/**
 * Node-side client for the audio-embedder Python sidecar.
 *
 * `computeAndSaveEmbedding` in audioEmbeddingService.ts calls this on every
 * new upload and during the backfill loop. The sidecar runs the CLAP model;
 * we send only the absolute path (same host, no network bytes for the audio).
 *
 * Best-effort semantics match the rest of the embedding pipeline:
 * any failure (network, timeout, bad status, malformed body) returns `null`
 * and logs a warning — the caller falls back to "no embedding for this track"
 * and the ranker uses NEUTRAL_EMBEDDING_SIMILARITY in its place.
 */
import { createLogger } from "../../utils/logger";

const log = createLogger("embedder-client");

const DEFAULT_BASE_URL = "http://127.0.0.1:7001";
// CLAP backfill: ~1.5 s/track on a typical 3-min file, but multi-minute
// prog-rock / live recordings (e.g. Echoes, 23 min) genuinely need 10–15 s
// to decode + window. 60 s gives generous headroom while still failing
// fast on a hung sidecar. Override per-call via AUDIO_EMBEDDER_TIMEOUT_MS.
const DEFAULT_TIMEOUT_MS = 60_000;

/** Wire response from the sidecar's `POST /embed`. */
export type EmbedderResponse = {
  /** Embedding vector. Always L2-normalised by the sidecar. */
  vec: number[];
  /** Sidecar-reported dimension. Validated to match `vec.length` before return. */
  dim: number;
  /** Model identifier the sidecar is using (e.g. `laion/clap-htsat-fused`). */
  model: string;
};

/** Wire response from the sidecar's `GET /healthz`. */
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

/**
 * Structural validator for `/embed` responses. Rejects anything missing the
 * three required fields, length mismatches between `vec` and `dim`, or
 * non-finite numbers in `vec` (which would poison cosine similarity).
 */
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
