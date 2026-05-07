const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    message: string
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

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(withApiBase(path), {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch (parseError) {
      console.warn(`Failed to parse error response from ${options.method ?? "GET"} ${path}:`, parseError);
    }

    if (response.status === 401 && !UNAUTHORIZED_BYPASS.has(path) && unauthorizedHandler) {
      unauthorizedHandler(path);
    }

    throw new ApiError(response.status, path, message);
  }

  if (options.skipJson || response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
