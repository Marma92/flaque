import path from "node:path";

const AUDIO_MIME_BY_EXT: Record<string, string> = {
  ".flac": "audio/flac",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".m4a": "audio/mp4"
};

const SUPPORTED_AUDIO_EXTENSIONS = new Set(Object.keys(AUDIO_MIME_BY_EXT));

export function getAudioMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return AUDIO_MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function isSupportedAudioFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_AUDIO_EXTENSIONS.has(ext);
}

export function getSupportedAudioExtensions(): string[] {
  return Array.from(SUPPORTED_AUDIO_EXTENSIONS.values());
}

export function getImageExtensionFromMime(mimeType?: string): string {
  if (!mimeType) {
    return ".jpg";
  }

  const normalized = mimeType.toLowerCase();
  if (normalized.includes("png")) {
    return ".png";
  }
  if (normalized.includes("webp")) {
    return ".webp";
  }
  return ".jpg";
}
