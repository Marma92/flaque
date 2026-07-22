import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN_ENV_KEYS = ["ADMIN_USERNAME", "ADMIN_EMAIL", "ADMIN_PASSWORD", "BOOTSTRAP_SYNC_ADMIN_PASSWORD"] as const;

let dataRoot = "";

beforeEach(async () => {
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "flaque-bootstrap-"));
  process.env.DATA_ROOT = dataRoot;
  vi.resetModules();

  const { ensureBaseDirectories } = await import("../utils/fs");
  const { initializeAuthDatabase } = await import("./db");

  await ensureBaseDirectories();
  initializeAuthDatabase();
});

afterEach(async () => {
  // Release the SQLite handle before removing the temp dir; on Windows an open
  // file cannot be unlinked (EBUSY), unlike POSIX.
  try {
    const { requireDb } = await import("./db");
    requireDb().close();
  } catch {
    // Database was never opened for this test; nothing to close.
  }
  await fs.rm(dataRoot, { recursive: true, force: true });
  delete process.env.DATA_ROOT;
  for (const key of ADMIN_ENV_KEYS) {
    delete process.env[key];
  }
  vi.resetModules();
});

describe("ensureDefaultAdmin (fresh install)", () => {
  it("generates a strong password that passes the password policy", async () => {
    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");
    const { verifyPassword } = await import("./password");
    const { validatePassword } = await import("../utils/validation");

    const result = ensureDefaultAdmin();
    expect(result?.generatedPassword).toEqual(expect.any(String));
    expect(result?.passwordSynced).toBe(false);

    const generated = result?.generatedPassword ?? "";
    expect(validatePassword(generated)).toBeNull();

    const row = findUserByUsername("admin");
    expect(verifyPassword(generated, row?.password_hash ?? "")).toBe(true);
    expect(verifyPassword("admin", row?.password_hash ?? "")).toBe(false);
  });

  it("uses ADMIN_PASSWORD when provided and reports no generated password", async () => {
    process.env.ADMIN_PASSWORD = "Str0ng-operator-pass";
    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");
    const { verifyPassword } = await import("./password");

    const result = ensureDefaultAdmin();
    expect(result?.generatedPassword).toBeNull();

    const row = findUserByUsername("admin");
    expect(verifyPassword("Str0ng-operator-pass", row?.password_hash ?? "")).toBe(true);
  });

  it("honours ADMIN_USERNAME and ADMIN_EMAIL overrides", async () => {
    process.env.ADMIN_USERNAME = "owner";
    process.env.ADMIN_EMAIL = "owner@example.com";
    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");

    const result = ensureDefaultAdmin();
    expect(result?.user.username).toBe("owner");

    const row = findUserByUsername("owner");
    expect(row?.email).toBe("owner@example.com");
  });

  it("uses an operator-provided ADMIN_PASSWORD as-is without enforcing the password policy", async () => {
    // Bootstrap secrets are the operator's explicit choice (and CI/e2e and the
    // prod setup script rely on short defaults). We accept them verbatim; the
    // security win is that we never fall back to a silent hard-coded default.
    process.env.ADMIN_PASSWORD = "admin";
    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");
    const { verifyPassword } = await import("./password");

    const result = ensureDefaultAdmin();
    expect(result?.generatedPassword).toBeNull();

    const row = findUserByUsername("admin");
    expect(verifyPassword("admin", row?.password_hash ?? "")).toBe(true);
  });
});

describe("ensureDefaultAdmin (existing install)", () => {
  it("does nothing when a user already exists and no sync is requested", async () => {
    process.env.ADMIN_PASSWORD = "First-pass-123";
    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");
    const { verifyPassword } = await import("./password");

    ensureDefaultAdmin();
    delete process.env.ADMIN_PASSWORD;

    const second = ensureDefaultAdmin();
    expect(second).toBeNull();

    const row = findUserByUsername("admin");
    expect(verifyPassword("First-pass-123", row?.password_hash ?? "")).toBe(true);
  });

  it("resets the admin password when BOOTSTRAP_SYNC_ADMIN_PASSWORD is set", async () => {
    process.env.ADMIN_PASSWORD = "First-pass-123";
    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");
    const { verifyPassword } = await import("./password");

    ensureDefaultAdmin();

    process.env.ADMIN_PASSWORD = "Second-pass-456";
    process.env.BOOTSTRAP_SYNC_ADMIN_PASSWORD = "true";

    const synced = ensureDefaultAdmin();
    expect(synced?.passwordSynced).toBe(true);

    const row = findUserByUsername("admin");
    expect(verifyPassword("Second-pass-456", row?.password_hash ?? "")).toBe(true);
    expect(verifyPassword("First-pass-123", row?.password_hash ?? "")).toBe(false);
  });
});
