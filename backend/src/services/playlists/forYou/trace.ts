import { ensureDir, readJsonFile, writeJsonAtomic } from "../../../utils/fs";
import type { ForYouTrace } from "../playlistTrace";
import { userForYouDir, userForYouTracePath } from "./paths";

export async function saveForYouTrace(userId: string, trace: ForYouTrace): Promise<void> {
  await ensureDir(userForYouDir(userId));
  await writeJsonAtomic(userForYouTracePath(userId), trace);
}

export async function loadForYouTrace(userId: string): Promise<ForYouTrace | null> {
  const data = await readJsonFile<ForYouTrace>(userForYouTracePath(userId), null as unknown as ForYouTrace);
  if (!data || typeof data !== "object" || !data.userId) return null;
  return data;
}
