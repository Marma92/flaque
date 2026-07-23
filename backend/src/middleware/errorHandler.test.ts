import { describe, expect, it, vi, beforeEach } from "vitest";
import { errorHandler } from "./errorHandler";
import { AppError } from "../utils/AppError";
import type { Response } from "express";

describe("errorHandler middleware", () => {
  const mockReq = {};
  const mockRes: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    sendFile: vi.fn(),
    send: vi.fn().mockReturnThis(),
  };
  const mockNext = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should handle AppError and return JSON response", () => {
    const err = new AppError("Test error", 400, "testError", { detail: "more info" });

    errorHandler(err as any, mockReq as any, mockRes as any, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: "Test error",
      code: "testError",
      details: { detail: "more info" },
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should handle AppError without details", () => {
    const err = new AppError("Test error", 404);

    errorHandler(err as any, mockReq as any, mockRes as any, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: "Test error",
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("should handle non-AppError as 500", () => {
    const err = new Error("Unexpected error");

    errorHandler(err as any, mockReq as any, mockRes as any, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: "Internal Server Error",
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("delegates to next without writing a body when headers were already sent", () => {
    const mockResWithSent = {
      ...mockRes,
      headersSent: true,
    } as any;
    const err = new AppError("Test error", 400);

    errorHandler(err as any, mockReq as any, mockResWithSent, mockNext);

    // Writing on top of an in-flight response would corrupt it (body shorter
    // than the advertised Content-Length), so we must hand off to Express's
    // default handler instead of calling res.status()/res.json().
    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockRes.json).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(err);
  });
});