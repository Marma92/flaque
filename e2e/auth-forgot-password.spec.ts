import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

import Database from "better-sqlite3";
import { expect, test } from "@playwright/test";

const authDbPath = path.resolve(process.cwd(), ".e2e/data/config/users.db");

function readPasswordResetTokenCount(): number {
  const database = new Database(authDbPath, { readonly: true });
  const row = database
    .prepare("SELECT COUNT(*) AS count FROM password_reset_tokens")
    .get() as { count: number };
  database.close();
  return row.count;
}

function insertResetToken(login: string, ttlMs = 30 * 60 * 1000): string {
  const database = new Database(authDbPath);
  const user = database
    .prepare("SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1")
    .get(login, login) as { id: string } | undefined;

  if (!user) {
    database.close();
    throw new Error(`User not found for login: ${login}`);
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  const expiresAt = now + ttlMs;

  database
    .prepare(
      "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at, used_at, requested_ip, requested_user_agent) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)"
    )
    .run(randomBytes(16).toString("hex"), user.id, tokenHash, expiresAt, now);

  database.close();
  return token;
}

async function submitResetPasswordForm(page: import("@playwright/test").Page, password: string): Promise<void> {
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Reset password" }).click();
}

test("rejects invalid reset token in browser", async ({ page }) => {
  await page.goto("/?resetToken=invalid-token-value");

  await submitResetPasswordForm(page, "invalid-token-pass-123");

  await expect(page.getByText("Invalid or expired reset token")).toBeVisible();
});

test("rejects expired reset token in browser", async ({ page }) => {
  const expiredToken = insertResetToken("admin@localhost", -1_000);

  await page.goto(`/?resetToken=${encodeURIComponent(expiredToken)}`);

  await submitResetPasswordForm(page, "expired-token-pass-123");

  await expect(page.getByText("Invalid or expired reset token")).toBeVisible();
});

test("login and forgot-password flow works in browser", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Flaque login" })).toBeVisible();

  await page.getByLabel("Username or email").fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Logout", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Flaque login" })).toBeVisible();

  await page.getByLabel("Username or email").fill("admin@localhost");
  await page.getByLabel("Password", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Logout", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Flaque login" })).toBeVisible();

  const countBeforeForgot = readPasswordResetTokenCount();

  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Username or email").fill("admin@localhost");
  await page.getByRole("button", { name: "Send recovery email" }).click();

  await expect(page.getByText("If this account exists, a recovery email has been sent.")).toBeVisible();
  await expect.poll(readPasswordResetTokenCount).toBeGreaterThan(countBeforeForgot);

  const newPassword = "admin-reset-e2e-456";
  const resetToken = insertResetToken("admin@localhost");
  await page.goto(`/?resetToken=${encodeURIComponent(resetToken)}`);

  await submitResetPasswordForm(page, newPassword);

  await expect(page.getByText("Password reset successful. You can now log in.")).toBeVisible();

  await page.getByLabel("Username or email").fill("admin@localhost");
  await page.getByLabel("Password", { exact: true }).fill("admin");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Invalid credentials")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
});
