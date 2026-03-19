import type { Track } from "../../types/library";
import { readJsonFile, writeJsonAtomic } from "../../utils/fs";
import { trackActivityLogFilePath } from "../../utils/paths";

type TrackActivityLog = Track[];
const MAX_TRACK_ACTIVITY_ENTRIES = 10;

export async function readTrackActivityLog(): Promise<TrackActivityLog> {
  const log = await readJsonFile<TrackActivityLog>(trackActivityLogFilePath, []);
  return Array.isArray(log) ? log : [];
}

export async function appendTrackActivityLogEntries(entries: Track[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const currentLog = await readTrackActivityLog();
  const nextLog = [...currentLog, ...entries];
  const cappedLog =
    nextLog.length > MAX_TRACK_ACTIVITY_ENTRIES
      ? nextLog.slice(nextLog.length - MAX_TRACK_ACTIVITY_ENTRIES)
      : nextLog;
  await writeJsonAtomic(trackActivityLogFilePath, cappedLog);
}
