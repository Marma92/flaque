import fs from "node:fs/promises";
import path from "node:path";

import { readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { indexRoot } from "../../utils/paths";

const ownershipFilePath = path.join(indexRoot, "track-ownership.json");

type OwnershipMap = Record<string, string>;

export async function readTrackOwnership(): Promise<OwnershipMap> {
  return readJsonFile<OwnershipMap>(ownershipFilePath, {});
}

export async function writeTrackOwnership(ownership: OwnershipMap): Promise<void> {
  await fs.mkdir(path.dirname(ownershipFilePath), { recursive: true });
  await writeJsonAtomic(ownershipFilePath, ownership);
}

export async function registerTrackOwner(relativePath: string, ownerId: string): Promise<void> {
  const ownership = await readTrackOwnership();
  if (!ownership[relativePath]) {
    ownership[relativePath] = ownerId;
    await writeTrackOwnership(ownership);
  }
}

export async function pruneTrackOwnership(validPaths: string[]): Promise<void> {
  const ownership = await readTrackOwnership();
  const validSet = new Set(validPaths);
  const pruned: OwnershipMap = {};

  for (const [trackPath, owner] of Object.entries(ownership)) {
    if (validSet.has(trackPath)) {
      pruned[trackPath] = owner;
    }
  }

  await writeTrackOwnership(pruned);
}
