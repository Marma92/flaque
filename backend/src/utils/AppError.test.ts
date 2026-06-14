import { describe, expect, it } from "vitest";
import { AppError } from "./AppError";

describe("AppError", () => {
  it("should create an error with message, statusCode, code and details", () => {
    const details = { key: "value" };
    const error = new AppError("Test error", 400, "testError", details);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Test error");
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("testError");
    expect(error.details).toBe(details);
  });

  it("should create an error with default statusCode 500 when not provided", () => {
    const error = new AppError("Test error");

    expect(error.statusCode).toBe(500);
  });

  it("should create an error with undefined details when not provided", () => {
    const error = new AppError("Test error", 400);

    expect(error.details).toBeUndefined();
  });
});