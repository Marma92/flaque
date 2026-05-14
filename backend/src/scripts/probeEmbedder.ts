/**
 * End-to-end smoke test for the audio-embedder sidecar.
 *
 * Usage:
 *   npm run embed:probe -- /absolute/path/to/track.mp3
 *
 * Pings /healthz, then asks for an embedding of the given file (or a
 * placeholder path if none is provided). Prints a short summary and exits
 * non-zero if either step fails. Does not touch the production embedding
 * pipeline.
 */
import process from "node:process";

import { pingEmbedder, requestEmbedding } from "../services/embeddings/embedderClient";

function summary(vec: number[]): string {
  const head = vec.slice(0, 4).map((v) => v.toFixed(4)).join(", ");
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return `len=${vec.length} head=[${head}, …] norm=${norm.toFixed(4)}`;
}

async function main(): Promise<void> {
  const argPath = process.argv[2];

  const health = await pingEmbedder();
  if (!health) {
    console.error("[probe] sidecar /healthz unreachable. Is it running?");
    console.error("[probe] start it with: ./backend/python-services/audio-embedder/start.sh");
    process.exit(2);
  }
  console.log(`[probe] sidecar healthy: model=${health.model}`);

  if (!argPath) {
    console.error("[probe] no path argument provided. Usage: npm run embed:probe -- <absolutePath>");
    process.exit(1);
  }

  const result = await requestEmbedding(argPath);
  if (!result) {
    console.error(`[probe] embedding request failed for ${argPath}`);
    process.exit(3);
  }
  console.log(`[probe] embedding ok: model=${result.model} ${summary(result.vec)}`);
}

void main().catch((error) => {
  console.error("[probe] unexpected error", error);
  process.exit(99);
});
