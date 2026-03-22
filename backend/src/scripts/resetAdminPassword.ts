import "dotenv/config";

import { createUser, findUserByUsername, initializeAuthDatabase, updateUserPassword } from "../auth/db";

function getArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function requireNonEmpty(input: string | null | undefined, label: string): string {
  const value = (input ?? "").trim();
  if (!value) {
    throw new Error(`${label} is required`);
  }
  return value;
}

function getPasswordArg(): string {
  const value = getArgValue("--password");
  if (value !== null) {
    if (!value) {
      throw new Error("password cannot be empty");
    }
    return value;
  }

  const fromEnv = process.env.NEW_ADMIN_PASSWORD;
  if (fromEnv) {
    return fromEnv;
  }

  throw new Error("missing --password (or NEW_ADMIN_PASSWORD env var)");
}

function getUsernameArg(): string {
  return requireNonEmpty(getArgValue("--username") ?? process.env.ADMIN_USERNAME ?? "admin", "username");
}

function printUsage(): void {
  console.log("Usage: node backend/dist/scripts/resetAdminPassword.js [--username <admin>] --password <new-password>");
  console.log("Alternative: set NEW_ADMIN_PASSWORD in env.");
}

function run(): void {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const username = getUsernameArg();
  const password = getPasswordArg();

  initializeAuthDatabase();

  const existing = findUserByUsername(username);
  if (!existing) {
    const created = createUser(username, password, "admin");
    console.log(`Admin user created: ${created.username}`);
    return;
  }

  if (existing.role !== "admin") {
    throw new Error(`user '${username}' exists but is not an admin`);
  }

  const updated = updateUserPassword(existing.id, password);
  if (!updated) {
    throw new Error("failed to update admin password");
  }

  console.log(`Admin password updated for: ${username}`);
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Admin password reset failed: ${message}`);
  process.exit(1);
}
