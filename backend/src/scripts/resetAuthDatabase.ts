import "dotenv/config";

import { promises as fs } from "node:fs";

import { ensureDefaultAdmin, initializeAuthDatabase } from "../auth/db";
import { ensureBaseDirectories } from "../utils/fs";
import { usersDbPath } from "../utils/paths";

async function removeIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    console.log(`Deleted: ${filePath}`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function run(): Promise<void> {
  console.log("[1/3] Ensuring base directories...");
  await ensureBaseDirectories();

  console.log("[2/3] Deleting auth database files...");
  await removeIfExists(usersDbPath);
  await removeIfExists(`${usersDbPath}-wal`);
  await removeIfExists(`${usersDbPath}-shm`);

  console.log("[3/3] Recreating auth database and bootstrap admin...");
  initializeAuthDatabase();
  const admin = ensureDefaultAdmin();

  if (admin?.generatedPassword) {
    console.log(`Bootstrap admin ready: ${admin.user.username}`);
    console.log(`Generated password (shown once): ${admin.generatedPassword}`);
  } else if (admin) {
    console.log(`Bootstrap admin ready: ${admin.user.username}`);
  }

  console.log("Auth database reset complete.");
}

run().catch((error: unknown) => {
  console.error("Auth database reset failed", error);
  process.exit(1);
});
