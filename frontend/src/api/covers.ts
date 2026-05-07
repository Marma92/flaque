import { withApiBase } from "./client";

export function coverPathUrl(coverRef: string): string {
  // Track.cover comes in two flavors: a relative file path (e.g. data/covers/foo.jpg)
  // resolved through libraryMediaResolver, or a fully-formed /api/covers/<id> URL
  // produced by coverService. Don't double-wrap the URL form.
  if (coverRef.startsWith("/api/") || /^https?:\/\//.test(coverRef)) {
    return withApiBase(coverRef);
  }
  const searchParams = new URLSearchParams({ path: coverRef });
  return withApiBase(`/api/covers/from-path?${searchParams.toString()}`);
}

export function coverUrl(trackId: string, coverPath?: string): string {
  if (coverPath) {
    return withApiBase(coverPath);
  }
  return withApiBase(`/api/covers/${trackId}`);
}
