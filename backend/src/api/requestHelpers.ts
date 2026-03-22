import type { Request } from "express";

export { hasOwnProperty } from "./queryParsers";

export function getClientIp(req: Request): string | undefined {
  const forwardedFor = req.headers["x-forwarded-for"];
  const firstForwarded =
    typeof forwardedFor === "string"
      ? forwardedFor.split(",", 1)[0]
      : Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : undefined;

  const candidate = (firstForwarded ?? req.ip ?? req.socket.remoteAddress ?? "").trim();
  return candidate || undefined;
}

export function isSqliteUniqueError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /unique/i.test(error.message);
}
