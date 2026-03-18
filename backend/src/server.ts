import "dotenv/config";

import { createServer } from "node:http";

import { createApp } from "./app";
import {
  deleteExpiredSessions,
  ensureDefaultAdmin,
  initializeAuthDatabase
} from "./auth/db";
import { IndexStore } from "./services/indexer/indexStore";
import { ensureBaseDirectories } from "./utils/fs";

const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function bootstrap(): Promise<void> {
  await ensureBaseDirectories();
  initializeAuthDatabase();

  const seededAdmin = ensureDefaultAdmin();
  if (seededAdmin) {
    console.log(`Admin user ready: ${seededAdmin.username}`);
  }

  const indexStore = new IndexStore();
  await indexStore.initialize();

  if (indexStore.getSnapshot().totalTracks === 0) {
    await indexStore.rebuild();
  }

  const app = createApp(indexStore);
  const server = createServer(app);
  const port = Number(process.env.PORT ?? 4000);

  server.listen(port, () => {
    console.log(`flaque backend listening on http://localhost:${port}`);
  });

  setInterval(() => {
    deleteExpiredSessions();
  }, SESSION_CLEANUP_INTERVAL_MS).unref();
}

bootstrap().catch((error: unknown) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
