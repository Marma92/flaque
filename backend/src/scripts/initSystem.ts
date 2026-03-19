import "dotenv/config";

import { ensureDefaultAdmin, initializeAuthDatabase } from "../auth/db";
import { IndexStore } from "../services/indexer/indexStore";
import { ensureBaseDirectories } from "../utils/fs";

/**
 * Initialize runtime folders and the auth database for production deployments.
 *
 * This script is safe to run multiple times:
 * - Missing directories/files are created.
 * - Existing admin users are preserved.
 * - Existing indexes are loaded and left intact.
 */
async function initSystem(): Promise<void> {
  console.log("[1/4] Ensuring runtime directories...");
  await ensureBaseDirectories();

  console.log("[2/4] Initializing SQLite auth database...");
  initializeAuthDatabase();

  console.log("[3/4] Ensuring bootstrap admin account...");
  const admin = ensureDefaultAdmin();
  if (admin) {
    console.log(`      Admin account ready: ${admin.username}`);
  } else {
    console.log("      Admin account already present");
  }

  console.log("[4/4] Loading library index snapshot...");
  const indexStore = new IndexStore();
  await indexStore.initialize();
  const snapshot = indexStore.getSnapshot();
  console.log(`      Index loaded with ${snapshot.totalTracks} track(s).`);

  console.log("Initialization complete.");
}

initSystem().catch((error: unknown) => {
  console.error("System initialization failed", error);
  process.exit(1);
});
