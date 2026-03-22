import "dotenv/config";

import { createServer } from "node:http";

import { createApp } from "./app";
import {
  deleteExpiredPasswordResetTokens,
  deleteExpiredSessions,
  ensureDefaultAdmin,
  initializeAuthDatabase
} from "./auth/db";
import { migrateLegacyPlaylists } from "./services/playlists/playlistStore";
import { IndexStore } from "./services/indexer/indexStore";
import { migratePerUserUploadsToSharedMusic } from "./services/storage/storageService";
import { ensureBaseDirectories } from "./utils/fs";

const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function readNonNegativeIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(raw) || raw < 0) {
    return fallback;
  }

  return Math.floor(raw);
}

async function bootstrap(): Promise<void> {
  await ensureBaseDirectories();
  await migrateLegacyPlaylists();

  const migratedTracks = await migratePerUserUploadsToSharedMusic();
  if (migratedTracks > 0) {
    console.log(`Migrated ${migratedTracks} track${migratedTracks === 1 ? "" : "s"} to shared music storage`);
  }

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

  server.requestTimeout = readNonNegativeIntEnv("HTTP_REQUEST_TIMEOUT_MS", 0);
  server.timeout = readNonNegativeIntEnv("HTTP_SOCKET_TIMEOUT_MS", 0);

  server.listen(port, () => {
    console.log(`flaque backend listening on http://localhost:${port}`);
  });

  setInterval(() => {
    deleteExpiredSessions();
    deleteExpiredPasswordResetTokens();
  }, SESSION_CLEANUP_INTERVAL_MS).unref();
}

bootstrap().catch((error: unknown) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
