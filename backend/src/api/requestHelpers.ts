import type { Request } from "express";

export { hasOwnProperty } from "./queryParsers";

export function getClientIp(req: Request): string | undefined {
  // Rely on Express's `req.ip`, which is derived from the configured
  // `trust proxy` setting (see resolveTrustProxySetting in app.ts): the direct
  // socket peer when proxies are untrusted, or the left-most client in
  // X-Forwarded-For when they are trusted. Reading the header directly here
  // would let a client forge the identity used for rate-limiting and audit logs.
  const candidate = (req.ip ?? req.socket.remoteAddress ?? "").trim();
  return candidate || undefined;
}

export function isSqliteUniqueError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /unique/i.test(error.message);
}
