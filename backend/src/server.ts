import "dotenv/config";

import type http from "node:http";
import { createServer } from "node:http";

import { createApp } from "./app";
import { ensureDefaultAdmin } from "./auth/bootstrap";
import { initializeAuthDatabase } from "./auth/dbConnection";
import { createLogger } from "./utils/logger";
import { deleteExpiredPasswordResetTokens } from "./auth/passwordResetDb";
import { deleteExpiredSessions } from "./auth/sessionDb";
import { migrateLegacyPlaylists } from "./services/playlists/playlistStore";
import { IndexStore } from "./services/indexer/indexStore";
import { migratePerUserUploadsToSharedMusic } from "./services/storage/storageService";
import { startBackupScheduler } from "./services/backup/backupService";
import { startVersionCheckSchedule } from "./services/versionCheck";
import { ensureBaseDirectories } from "./utils/fs";
import { checkAndRegenerateOnBoot } from "./services/playlists/autoPlaylistService";
import { checkAndRegenerateForYouOnBoot } from "./services/playlists/forYouPlaylistService";
import { checkAndRegeneratePersonalOnBoot } from "./services/playlists/personalPlaylistService";
import { listUsers } from "./auth/db";

const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

function readNonNegativeIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(raw) || raw < 0) {
    return fallback;
  }

  return Math.floor(raw);
}

const log = createLogger("server");

function gracefulShutdown(server: http.Server, signal: string): void {
  log.info(`Received ${signal}, shutting down gracefully`);

  server.close(() => {
    log.info("All connections closed, exiting");
    process.exit(0);
  });

  setTimeout(() => {
    log.warn("Forcing exit after shutdown timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
}

async function bootstrap(): Promise<void> {
  await ensureBaseDirectories();
  await migrateLegacyPlaylists();

  const migratedTracks = await migratePerUserUploadsToSharedMusic();
  if (migratedTracks > 0) {
    log.info(`Migrated ${migratedTracks} track${migratedTracks === 1 ? "" : "s"} to shared music storage`);
  }

  initializeAuthDatabase();

  const seededAdmin = ensureDefaultAdmin();
  if (seededAdmin) {
    log.info(`Admin user ready: ${seededAdmin.username}`);
  }

  const indexStore = new IndexStore();
  await indexStore.initialize();

  if (indexStore.getSnapshot().totalTracks === 0) {
    await indexStore.rebuild();
  }

  const app = createApp(indexStore);
  const server = createServer(app);
  const port = Number(process.env.BACKEND_PORT ?? process.env.PORT ?? 4000);

  server.requestTimeout = readNonNegativeIntEnv("HTTP_REQUEST_TIMEOUT_MS", 0);
  server.timeout = readNonNegativeIntEnv("HTTP_SOCKET_TIMEOUT_MS", 0);

  server.listen(port, () => {
    log.info(`flaque backend listening on http://localhost:${port}`);
  });

  process.on("SIGTERM", () => gracefulShutdown(server, "SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown(server, "SIGINT"));

  setInterval(() => {
    deleteExpiredSessions();
    deleteExpiredPasswordResetTokens();
  }, SESSION_CLEANUP_INTERVAL_MS).unref();

  startVersionCheckSchedule();
  void startBackupScheduler();
  void checkAndRegenerateOnBoot(indexStore.getSnapshot().tracks);
  await Promise.all(
    listUsers().map((user) => checkAndRegenerateForYouOnBoot(user.id, indexStore))
  );
  await Promise.all(
    listUsers().map((user) => checkAndRegeneratePersonalOnBoot(user.id, indexStore))
  );
}

bootstrap().catch((error: unknown) => {
  log.error("Failed to start backend", { error: String(error) });
  process.exit(1);
});
