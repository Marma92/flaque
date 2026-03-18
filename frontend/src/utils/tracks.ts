import type { Track } from "../types";

export function fileNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const name = normalized.split("/").filter(Boolean).pop();
  return name ?? filePath;
}

export function getTrackDisplayTitle(track: Pick<Track, "path" | "tags">): string {
  const title = track.tags.title?.trim();
  if (title) {
    return title;
  }

  return fileNameFromPath(track.path);
}
