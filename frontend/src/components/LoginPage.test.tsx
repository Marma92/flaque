/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
  });

  it("submits login using username or email field", async () => {
    const onLogin = vi.fn<(login: string, password: string) => Promise<void>>().mockResolvedValue(undefined);

    render(
      <LoginPage
        onLogin={onLogin}
        onRequestPasswordReset={vi.fn().mockResolvedValue(undefined)}
        onResetPassword={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.change(screen.getByLabelText("Username or email"), { target: { value: "admin@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith("admin@example.com", "secret");
    });
  });

  it("starts forgot password flow from login page", async () => {
    const onRequestPasswordReset = vi.fn<(login: string) => Promise<void>>().mockResolvedValue(undefined);

    render(
      <LoginPage
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onRequestPasswordReset={onRequestPasswordReset}
        onResetPassword={vi.fn().mockResolvedValue(undefined)}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.change(screen.getByLabelText("Username or email"), { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Send recovery email" }));

    await waitFor(() => {
      expect(onRequestPasswordReset).toHaveBeenCalledWith("admin");
      expect(screen.getByText("If this account exists, a recovery email has been sent.")).toBeTruthy();
    });
  });

  it("resets password when reset token is present in URL", async () => {
    window.history.replaceState({}, "", "/?resetToken=test-token-123");
    const onResetPassword = vi.fn<(token: string, newPassword: string) => Promise<void>>().mockResolvedValue(undefined);

    render(
      <LoginPage
        onLogin={vi.fn().mockResolvedValue(undefined)}
        onRequestPasswordReset={vi.fn().mockResolvedValue(undefined)}
        onResetPassword={onResetPassword}
      />
    );

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-123" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(onResetPassword).toHaveBeenCalledWith("test-token-123", "new-password-123");
      expect(screen.getByText("Password reset successful. You can now log in.")).toBeTruthy();
    });
  });
});
