import fs from "node:fs/promises";
import path from "node:path";

import { fileExists } from "../../utils/fs";
import { getImageExtensionFromMime } from "../../utils/mime";
import { coversRoot } from "../../utils/paths";

type EmbeddedCover = {
  data: Buffer;
  format?: string;
};

const COVER_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export async function findCoverFileByTrackId(trackId: string): Promise<string | null> {
  for (const ext of COVER_EXTENSIONS) {
    const candidate = path.join(coversRoot, `${trackId}${ext}`);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function ensureTrackCover(trackId: string, cover?: EmbeddedCover): Promise<string | undefined> {
  const existing = await findCoverFileByTrackId(trackId);
  if (existing) {
    return `/api/covers/${trackId}`;
  }

  if (!cover || !cover.data) {
    return undefined;
  }

  const extension = getImageExtensionFromMime(cover.format);
  const targetPath = path.join(coversRoot, `${trackId}${extension}`);
  await fs.writeFile(targetPath, cover.data);
  return `/api/covers/${trackId}`;
}
