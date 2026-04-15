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
  vi.resetModules();
});

describe("ensureDefaultAdmin", () => {
  it("creates the bootstrap admin with default admin/admin credentials", async () => {
    const { ensureDefaultAdmin, findUserByUsername } = await import("./db");
    const { verifyPassword } = await import("./password");

    const admin = ensureDefaultAdmin();
    expect(admin).toMatchObject({
      username: "admin",
      role: "admin"
    });

    const row = findUserByUsername("admin");
    expect(row).not.toBeNull();
    if (!row) {
      return;
    }

    expect(row.email).toBe("admin@localhost");
    expect(verifyPassword("admin", row.password_hash)).toBe(true);
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
