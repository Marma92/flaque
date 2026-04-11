import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { createLogger } from "../../utils/logger";
import { tmpUploadsRoot } from "../../utils/paths";

const log = createLogger("chunked-upload");

// 99 MiB: kept just under the common 100 MB reverse-proxy body limit
// (Cloudflare Free, nginx defaults, some CDN WAFs) so a single chunk
// request never trips those limits.
const CHUNK_SIZE = 99 * 1024 * 1024;
const UPLOAD_SESSION_TTL_MS = 60 * 60 * 1000;

export type UploadSession = {
  id: string;
  ownerId: string;
  fileName: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: Set<number>;
  tempDir: string;
  createdAt: number;
};

export class SessionForbiddenError extends Error {
  constructor(sessionId: string) {
    super(`Upload session not owned by caller: ${sessionId}`);
    this.name = "SessionForbiddenError";
  }
}

const sessions = new Map<string, UploadSession>();

export function getChunkSize(): number {
  return CHUNK_SIZE;
}

function cleanupOldSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > UPLOAD_SESSION_TTL_MS) {
      void fs.rm(session.tempDir, { recursive: true, force: true }).catch(() => {});
      sessions.delete(id);
      log.info("Cleaned up expired upload session", { id });
    }
  }
}

// unref so the timer does not keep the process alive in tests / shutdown.
setInterval(cleanupOldSessions, 5 * 60 * 1000).unref();

export async function initChunkedUpload(
  ownerId: string,
  fileName: string,
  totalSize: number
): Promise<UploadSession> {
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempDir = path.join(tmpUploadsRoot, `chunked-${sessionId}`);

  await fs.mkdir(tempDir, { recursive: true });

  const session: UploadSession = {
    id: sessionId,
    ownerId,
    fileName,
    totalSize,
    chunkSize: CHUNK_SIZE,
    totalChunks,
    receivedChunks: new Set(),
    tempDir,
    createdAt: Date.now()
  };

  sessions.set(sessionId, session);

  log.info("Initialized chunked upload session", { sessionId, ownerId, fileName, totalSize, totalChunks });
  return session;
}

export function getSession(sessionId: string): UploadSession | undefined {
  return sessions.get(sessionId);
}

export function getOwnedSession(sessionId: string, ownerId: string): UploadSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) {
    return undefined;
  }
  if (session.ownerId !== ownerId) {
    throw new SessionForbiddenError(sessionId);
  }
  return session;
}

export async function saveChunk(
  sessionId: string,
  ownerId: string,
  chunkIndex: number,
  data: Buffer
): Promise<UploadSession> {
  const session = getOwnedSession(sessionId, ownerId);
  if (!session) {
    throw new Error(`Upload session not found: ${sessionId}`);
  }

  if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
    throw new Error(`Invalid chunk index: ${chunkIndex}`);
  }

  const chunkPath = path.join(session.tempDir, `chunk-${String(chunkIndex).padStart(6, "0")}`);
  await fs.writeFile(chunkPath, data);
  session.receivedChunks.add(chunkIndex);

  log.debug("Chunk saved", { sessionId, chunkIndex, received: session.receivedChunks.size });
  return session;
}

export async function assembleChunks(sessionId: string, ownerId: string): Promise<string> {
  const session = getOwnedSession(sessionId, ownerId);
  if (!session) {
    throw new Error(`Upload session not found: ${sessionId}`);
  }

  if (session.receivedChunks.size !== session.totalChunks) {
    const missing = [];
    for (let i = 0; i < session.totalChunks; i++) {
      if (!session.receivedChunks.has(i)) {
        missing.push(i);
      }
    }
    throw new Error(`Missing chunks: ${missing.join(", ")}`);
  }

  const outputFileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(session.fileName)}`;
  const outputPath = path.join(tmpUploadsRoot, outputFileName);

  const writeStream = createWriteStream(outputPath);

  try {
    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(session.tempDir, `chunk-${String(i).padStart(6, "0")}`);
      await pipeline(createReadStream(chunkPath), writeStream, { end: false });
    }
    writeStream.end();
    await once(writeStream, "finish");
  } catch (error) {
    writeStream.destroy();
    await fs.unlink(outputPath).catch(() => {});
    throw error;
  }

  await fs.rm(session.tempDir, { recursive: true, force: true });
  sessions.delete(sessionId);

  log.info("Chunks assembled successfully", { sessionId, outputFileName });
  return outputPath;
}

export async function cancelChunkedUpload(sessionId: string, ownerId: string): Promise<void> {
  const session = getOwnedSession(sessionId, ownerId);
  if (!session) {
    return;
  }

  await fs.rm(session.tempDir, { recursive: true, force: true }).catch(() => {});
  sessions.delete(sessionId);
  log.info("Chunked upload cancelled", { sessionId });
}
