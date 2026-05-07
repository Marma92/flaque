import { withApiBase } from "./client";

export function streamUrl(trackId: string, options?: { transcode?: "opus" | "mp3" }): string {
  const basePath = `/api/tracks/${trackId}/stream`;
  if (!options?.transcode) {
    return withApiBase(basePath);
  }

  const search = new URLSearchParams({ transcode: options.transcode });
  return withApiBase(`${basePath}?${search.toString()}`);
}
