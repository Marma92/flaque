import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";

/**
 * Centralized error handling middleware.
 * Converts AppError instances to appropriate JSON responses.
 * For non-AppError, returns a generic 500 error.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  // Log unexpected errors (in a real app, you would use a logger)
  console.error("Unexpected error:", err);

  res.status(500).json({
    error: "Internal Server Error",
  });
}