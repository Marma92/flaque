import path from "node:path";

import { readJsonFile, updateJsonFile } from "../../utils/fs";
import { indexRoot } from "../../utils/paths";

const ownershipFilePath = path.join(indexRoot, "track-ownership.json");

type OwnershipMap = Record<string, string>;

export async function readTrackOwnership(): Promise<OwnershipMap> {
  return readJsonFile<OwnershipMap>(ownershipFilePath, {});
}

export async function writeTrackOwnership(ownership: OwnershipMap): Promise<void> {
  await updateJsonFile<OwnershipMap>(ownershipFilePath, {}, () => ownership);
}

export async function registerTrackOwner(relativePath: string, ownerId: string): Promise<void> {
  await updateJsonFile<OwnershipMap>(ownershipFilePath, {}, (current) => {
    if (current[relativePath]) {
      return undefined;
    }
    return { ...current, [relativePath]: ownerId };
  });
}

export async function pruneTrackOwnership(validPaths: string[]): Promise<void> {
  const validSet = new Set(validPaths);
  await updateJsonFile<OwnershipMap>(ownershipFilePath, {}, (current) => {
    const pruned: OwnershipMap = {};
    let changed = false;
    for (const [trackPath, owner] of Object.entries(current)) {
      if (validSet.has(trackPath)) {
        pruned[trackPath] = owner;
      } else {
        changed = true;
      }
    }
    return changed ? pruned : undefined;
  });
}
