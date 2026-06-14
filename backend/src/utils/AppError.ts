/**
 * Application error class for consistent error handling
 */
export class AppError extends Error {
  public readonly statusCode: number;
  /** Stable, locale-free identifier the client can translate (message is the English fallback). */
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = 500, code?: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Maintains proper stack trace (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}