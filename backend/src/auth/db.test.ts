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
  await fs.rm(dataRoot, { recursive: true, force: true });
  delete process.env.DATA_ROOT;
  delete process.env.ADMIN_USERNAME;
  delete process.env.ADMIN_PASSWORD;
  vi.resetModules();
});

describe("ensureDefaultAdmin", () => {
  it("creates the bootstrap admin from env credentials", async () => {
    process.env.ADMIN_USERNAME = "bootstrap-admin";
    process.env.ADMIN_PASSWORD = "bootstrap-pass-1";

    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");
    const { verifyPassword } = await import("./password");

    const admin = ensureDefaultAdmin();
    expect(admin).toMatchObject({
      username: "bootstrap-admin",
      role: "admin"
    });

    const row = findUserByUsername("bootstrap-admin");
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }

    expect(verifyPassword("bootstrap-pass-1", row.password_hash)).toBe(true);
  });

  it("does not override admin password when env password changes", async () => {
    process.env.ADMIN_USERNAME = "bootstrap-admin";
    process.env.ADMIN_PASSWORD = "bootstrap-pass-1";

    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");
    const { verifyPassword } = await import("./password");

    ensureDefaultAdmin();

    process.env.ADMIN_PASSWORD = "bootstrap-pass-2";
    const existingAdmin = ensureDefaultAdmin();
    expect(existingAdmin).toMatchObject({
      username: "bootstrap-admin",
      role: "admin"
    });

    const row = findUserByUsername("bootstrap-admin");
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }

    expect(verifyPassword("bootstrap-pass-1", row.password_hash)).toBe(true);
    expect(verifyPassword("bootstrap-pass-2", row.password_hash)).toBe(false);
  });

  it("preserves utf-8 bootstrap password semantics", async () => {
    process.env.ADMIN_USERNAME = "bootstrap-admin";
    process.env.ADMIN_PASSWORD = "MötDePasse-🔒-漢字";

    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");
    const { verifyPassword } = await import("./password");

    ensureDefaultAdmin();
    const row = findUserByUsername("bootstrap-admin");
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }

    expect(verifyPassword("MötDePasse-🔒-漢字", row.password_hash)).toBe(true);
  });

  it("ignores trailing carriage return from env files", async () => {
    process.env.ADMIN_USERNAME = "bootstrap-admin";
    process.env.ADMIN_PASSWORD = "bootstrap-pass-1\r";

    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");
    const { verifyPassword } = await import("./password");

    ensureDefaultAdmin();
    const row = findUserByUsername("bootstrap-admin");
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }

    expect(verifyPassword("bootstrap-pass-1", row.password_hash)).toBe(true);
    expect(verifyPassword("bootstrap-pass-1\r", row.password_hash)).toBe(false);
  });
});
