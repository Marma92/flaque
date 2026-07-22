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
import { backfillMissingEmbeddings } from "./services/embeddings/audioEmbeddingService";
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
  if (seededAdmin?.generatedPassword) {
    log.warn(
      "Bootstrap admin created with a GENERATED password (shown once — store it now, " +
        "then change it after first login; set ADMIN_PASSWORD to choose your own)",
      { username: seededAdmin.user.username, password: seededAdmin.generatedPassword }
    );
  } else if (seededAdmin?.passwordSynced) {
    log.info(`Admin password synced from ADMIN_PASSWORD: ${seededAdmin.user.username}`);
  } else if (seededAdmin) {
    log.info(`Admin user ready: ${seededAdmin.user.username}`);
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

  // Keep-alive lifetime must outlive the reverse proxy's idle timeout so the
  // proxy — not the backend — decides when to retire a pooled connection. With
  // Node's short 5s default, nginx can pick an idle keep-alive socket to reuse
  // at the exact moment Node is closing it; the in-flight response is then
  // truncated and the browser surfaces a "Content-Length header of network
  // response exceeds response Body" error. Default to 65s, comfortably above
  // nginx's 60s upstream keepalive_timeout.
  const keepAliveTimeoutMs = readNonNegativeIntEnv("HTTP_KEEP_ALIVE_TIMEOUT_MS", 65_000);
  server.keepAliveTimeout = keepAliveTimeoutMs;
  // headersTimeout must stay strictly greater than keepAliveTimeout, otherwise
  // Node can time out the next request on a reused connection while the current
  // response is still being written. Clamp up if the env override breaks that.
  server.headersTimeout = Math.max(
    readNonNegativeIntEnv("HTTP_HEADERS_TIMEOUT_MS", 70_000),
    keepAliveTimeoutMs + 5_000
  );

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

  // Audio embedding backfill: trickles through any tracks missing an
  // embedding sidecar. Fire-and-forget — never blocks startup.
  void backfillMissingEmbeddings(
    indexStore.getSnapshot().tracks.map((t) => ({ id: t.id, path: t.path }))
  ).catch((error: unknown) => {
    log.warn("Embedding backfill failed", { error: String(error) });
  });
}

bootstrap().catch((error: unknown) => {
  log.error("Failed to start backend", { error: String(error) });
  process.exit(1);
});
