import type { Track } from "../../types/library";
import { readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { trackActivityLogFilePath } from "../../utils/paths";

type TrackActivityLog = Track[];

export async function readTrackActivityLog(): Promise<TrackActivityLog> {
  const log = await readJsonFile<TrackActivityLog>(trackActivityLogFilePath, []);
  return Array.isArray(log) ? log : [];
}

export async function appendTrackActivityLogEntries(entries: Track[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const currentLog = await readTrackActivityLog();
  await writeJsonAtomic(trackActivityLogFilePath, [...currentLog, ...entries]);
}
