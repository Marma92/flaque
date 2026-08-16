import i18n from "../i18n";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    message: string,
    /** Stable error code from the backend, if any (see the `errors` namespace). */
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type RequestOptions = RequestInit & {
  skipJson?: boolean;
};

type UnauthorizedHandler = (endpoint: string) => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

// Paths where a 401 is part of the normal login flow rather than a session
// loss — do not fire the global handler for these.
const UNAUTHORIZED_BYPASS = new Set([
  "/api/auth/me",
  "/api/auth/login",
  "/api/auth/forgot-password",
  "/api/auth/reset-password"
]);

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export function withApiBase(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${API_BASE}${path}`;
}

/**
 * Identical GETs already in flight, keyed by path.
 *
 * Independent hooks legitimately ask for the same resource at the same moment —
 * `useLibraryData` runs one effect keyed on `filters` and another keyed on
 * `user`, and with no filters applied both request `/api/library` on mount.
 * They share the single round-trip instead of racing two.
 *
 * This is coalescing, not caching: an entry lives only until its request
 * settles, so every new call still hits the network. Callers do receive the
 * same resolved object, which is safe here because API payloads are treated as
 * immutable state.
 */
const inFlightGets = new Map<string, Promise<unknown>>();

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  // Only plain reads are shared: anything carrying a body, custom headers or a
  // non-GET method may not be interchangeable between callers.
  const coalescable =
    method === "GET" && !options.body && !options.headers && !options.skipJson;

  if (coalescable) {
    const existing = inFlightGets.get(path) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }
  }

  const request = performRequest<T>(path, options);

  if (coalescable) {
    inFlightGets.set(path, request);
    const release = (): void => {
      inFlightGets.delete(path);
    };
    // Both branches are handled, so this never surfaces as an unhandled
    // rejection; the caller still sees the original promise's failure.
    request.then(release, release);
  }

  return request;
}

async function performRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const response = await fetch(withApiBase(path), {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    let serverMessage = `Request failed (${response.status})`;
    let code: string | undefined;
    try {
      const payload = (await response.json()) as { error?: string; code?: string };
      if (payload.error) {
        serverMessage = payload.error;
      }
      code = payload.code;
    } catch (parseError) {
      console.warn(`Failed to parse error response from ${options.method ?? "GET"} ${path}:`, parseError);
    }

    // Localize from the stable code when present, falling back to the server's
    // English message. Translated at the boundary so every `error.message`
    // display site shows the localized text without changes.
    const message = code
      ? i18n.t(`errors:${code}`, { defaultValue: serverMessage })
      : serverMessage;

    if (response.status === 401 && !UNAUTHORIZED_BYPASS.has(path) && unauthorizedHandler) {
      unauthorizedHandler(path);
    }

    throw new ApiError(response.status, path, message, code);
  }

  if (options.skipJson || response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
