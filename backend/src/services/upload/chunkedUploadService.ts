import fs from "node:fs/promises";
import path from "node:path";

import { createLogger } from "../../utils/logger";
import { tmpUploadsRoot } from "../../utils/paths";

const log = createLogger("chunked-upload");

const CHUNK_SIZE = 99 * 1024 * 1024;
const UPLOAD_SESSION_TTL_MS = 60 * 60 * 1000;

export type UploadSession = {
  id: string;
  fileName: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  receivedChunks: Set<number>;
  tempDir: string;
  createdAt: number;
};

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

setInterval(cleanupOldSessions, 5 * 60 * 1000);

export function initChunkedUpload(fileName: string, totalSize: number): UploadSession {
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempDir = path.join(tmpUploadsRoot, `chunked-${sessionId}`);

  const session: UploadSession = {
    id: sessionId,
    fileName,
    totalSize,
    chunkSize: CHUNK_SIZE,
    totalChunks,
    receivedChunks: new Set(),
    tempDir,
    createdAt: Date.now()
  };

  sessions.set(sessionId, session);
  void fs.mkdir(tempDir, { recursive: true });

  log.info("Initialized chunked upload session", { sessionId, fileName, totalSize, totalChunks });
  return session;
}

export function getSession(sessionId: string): UploadSession | undefined {
  return sessions.get(sessionId);
}

export async function saveChunk(sessionId: string, chunkIndex: number, data: Buffer): Promise<void> {
  const session = sessions.get(sessionId);
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
}

export async function assembleChunks(sessionId: string): Promise<string> {
  const session = sessions.get(sessionId);
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

  const writeStream = await fs.open(outputPath, "w");

  try {
    for (let i = 0; i < session.totalChunks; i++) {
      const chunkPath = path.join(session.tempDir, `chunk-${String(i).padStart(6, "0")}`);
      const chunkData = await fs.readFile(chunkPath);
      await writeStream.write(chunkData);
    }
  } finally {
    await writeStream.close();
  }

  await fs.rm(session.tempDir, { recursive: true, force: true });
  sessions.delete(sessionId);

  log.info("Chunks assembled successfully", { sessionId, outputFileName });
  return outputPath;
}

export async function cancelChunkedUpload(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  await fs.rm(session.tempDir, { recursive: true, force: true }).catch(() => {});
  sessions.delete(sessionId);
  log.info("Chunked upload cancelled", { sessionId });
}
