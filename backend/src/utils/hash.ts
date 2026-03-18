import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

export async function hashFile(filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function createTrackId(owner: string, relativePath: string): string {
  return createHash("sha1").update(`${owner}:${relativePath}`).digest("hex");
}

export function createId(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}
