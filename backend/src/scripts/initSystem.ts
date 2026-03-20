import "dotenv/config";

import { ensureDefaultAdmin, initializeAuthDatabase } from "../auth/db";
import { IndexStore } from "../services/indexer/indexStore";
import { migrateLegacyPlaylists } from "../services/playlists/playlistStore";
import { ensureBaseDirectories } from "../utils/fs";

/**
 * Initialize runtime folders and the auth database for production deployments.
 *
 * This script is safe to run multiple times:
 * - Missing directories/files are created.
 * - The bootstrap admin account is created or synchronized from env credentials.
 * - Existing indexes are loaded and left intact.
 */
async function initSystem(): Promise<void> {
  console.log("[1/5] Ensuring runtime directories...");
  await ensureBaseDirectories();

  console.log("[2/5] Migrating legacy playlists layout...");
  await migrateLegacyPlaylists();

  console.log("[3/5] Initializing SQLite auth database...");
  initializeAuthDatabase();

  console.log("[4/5] Ensuring bootstrap admin account...");
  const admin = ensureDefaultAdmin();
  if (admin) {
    console.log(`      Admin account ready: ${admin.username}`);
  } else {
    console.log("      Admin account already present");
  }

  console.log("[5/5] Loading library index snapshot...");
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
