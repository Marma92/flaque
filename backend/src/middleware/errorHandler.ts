import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { AppError } from "../utils/AppError";
import { createLogger } from "../utils/logger";

const log = createLogger("http");

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  // If the response already started streaming (e.g. a file send that failed
  // mid-flight), we cannot write a JSON error body on top of it — doing so
  // throws "Cannot set headers after they are sent" and leaves the socket with
  // a body shorter than its advertised Content-Length. Hand off to Express's
  // default handler, which aborts the connection cleanly.
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.code !== undefined ? { code: err.code } : {}),
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({ error: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  log.error("Unhandled request error", { message, stack });

  res.status(500).json({
    error: "Internal Server Error",
  });
}