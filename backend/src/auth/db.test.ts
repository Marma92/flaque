import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let dataRoot = "";

beforeEach(async () => {
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "flaque-auth-db-"));
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
  vi.resetModules();
});

describe("ensureDefaultAdmin", () => {
  it("creates the bootstrap admin with a generated (non-default) password", async () => {
    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");
    const { verifyPassword } = await import("./password");

    const admin = ensureDefaultAdmin();
    expect(admin?.user).toMatchObject({
      username: "admin",
      role: "admin"
    });
    expect(admin?.generatedPassword).toEqual(expect.any(String));
    expect(admin?.generatedPassword?.length).toBeGreaterThanOrEqual(16);

    const row = findUserByUsername("admin");
    expect(row).not.toBeNull();
    if (!row || !admin?.generatedPassword) {
      return;
    }

    expect(row.email).toBe("admin@localhost");
    // The generated password works and the old hard-coded default no longer does.
    expect(verifyPassword(admin.generatedPassword, row.password_hash)).toBe(true);
    expect(verifyPassword("admin", row.password_hash)).toBe(false);
  });

  it("does not create a new admin when at least one user already exists", async () => {
    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");

    ensureDefaultAdmin();
    const firstAdmin = findUserByUsername("admin");
    expect(firstAdmin).not.toBeNull();
    if (!firstAdmin) {
      return;
    }

    const secondRun = ensureDefaultAdmin();
    expect(secondRun).toBeNull();

    const row = findUserByUsername("admin");
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }

    expect(row.id).toBe(firstAdmin.id);
  });
});
