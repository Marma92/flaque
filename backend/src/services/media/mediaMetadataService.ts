import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { fileExists, writeJsonAtomic } from "../../utils/fs";
import { toDataRelativePath } from "../storage/storageService";

const AUDIO_DB_SEARCH_URL = "https://www.theaudiodb.com/api/v1/json/2/search.php";
const AUDIO_DB_ALBUM_SEARCH_URL = "https://www.theaudiodb.com/api/v1/json/2/searchalbum.php";

export function normalizeDirectorySegment(value: string): string {
  const normalized = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return normalized || "unknown";
}

export function pickImageExtension(contentType: string | null, sourceUrl: string): string {
  const normalizedContentType = contentType?.toLowerCase().trim();
  if (normalizedContentType === "image/png") {
    return ".png";
  }
  if (normalizedContentType === "image/webp") {
    return ".webp";
  }
  if (normalizedContentType === "image/jpeg" || normalizedContentType === "image/jpg") {
    return ".jpg";
  }

  try {
    const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
    if (extension === ".png" || extension === ".jpg" || extension === ".jpeg" || extension === ".webp") {
      return extension === ".jpeg" ? ".jpg" : extension;
    }
  } catch {
    return ".jpg";
  }

  return ".jpg";
}

export function pickImageExtensionFromCoverFormat(format?: string): string {
  const normalizedFormat = format?.toLowerCase().trim();
  if (!normalizedFormat) {
    return ".jpg";
  }

  if (normalizedFormat.includes("png")) {
    return ".png";
  }
  if (normalizedFormat.includes("webp")) {
    return ".webp";
  }
  if (normalizedFormat.includes("jpeg") || normalizedFormat.includes("jpg")) {
    return ".jpg";
  }

  return ".jpg";
}

export async function downloadImageToDirectory(
  imageUrl: string,
  targetDir: string,
  fileBaseName: string
): Promise<string | undefined> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    return undefined;
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  if (imageBuffer.length === 0) {
    return undefined;
  }

  const extension = pickImageExtension(response.headers.get("content-type"), imageUrl);
  const filePath = path.join(targetDir, `${fileBaseName}${extension}`);
  await fs.writeFile(filePath, imageBuffer);
  return toDataRelativePath(filePath);
}

async function downloadImageAsJpegToDirectory(
  imageUrl: string,
  targetDir: string,
  fileBaseName: string
): Promise<string | undefined> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    return undefined;
  }

  const imageBuffer = Buffer.from(await response.arrayBuffer());
  if (imageBuffer.length === 0) {
    return undefined;
  }

  let jpegBuffer: Buffer;
  try {
    jpegBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
  } catch {
    const contentType = response.headers.get("content-type")?.toLowerCase().trim();
    if (contentType !== "image/jpeg" && contentType !== "image/jpg") {
      return undefined;
    }
    jpegBuffer = imageBuffer;
  }

  const filePath = path.join(targetDir, `${fileBaseName}.jpg`);
  await fs.writeFile(filePath, jpegBuffer);
  return toDataRelativePath(filePath);
}

export async function writeEmbeddedCoverToDirectory(
  cover: { data: Buffer; format?: string } | undefined,
  targetDir: string,
  fileBaseName: string
): Promise<string | undefined> {
  if (!cover?.data || cover.data.length === 0) {
    return undefined;
  }

  const extension = pickImageExtensionFromCoverFormat(cover.format);
  const filePath = path.join(targetDir, `${fileBaseName}${extension}`);
  await fs.writeFile(filePath, cover.data);
  return toDataRelativePath(filePath);
}

export async function fetchArtistPhotoPath(artistName: string, artistDir: string): Promise<string | undefined> {
  try {
    const searchUrl = new URL(AUDIO_DB_SEARCH_URL);
    searchUrl.searchParams.set("s", artistName);
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      return undefined;
    }

    const payload = (await searchResponse.json()) as {
      artists?: Array<{ strArtistThumb?: string | null }>;
    };
    const thumbUrl = payload.artists?.[0]?.strArtistThumb?.trim();
    if (!thumbUrl) {
      return undefined;
    }

    return await downloadImageToDirectory(thumbUrl, artistDir, "artist-photo");
  } catch {
    return undefined;
  }
}

export async function fetchAlbumCoverPath(
  artistName: string,
  albumName: string,
  albumDir: string
): Promise<string | undefined> {
  try {
    const searchUrl = new URL(AUDIO_DB_ALBUM_SEARCH_URL);
    searchUrl.searchParams.set("s", artistName);
    searchUrl.searchParams.set("a", albumName);
    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) {
      return undefined;
    }

    const payload = (await searchResponse.json()) as {
      album?: Array<{ strAlbumThumb?: string | null }>;
    };
    const thumbUrl = payload.album?.[0]?.strAlbumThumb?.trim();
    if (!thumbUrl) {
      return undefined;
    }

    return await downloadImageAsJpegToDirectory(thumbUrl, albumDir, "album-cover");
  } catch {
    return undefined;
  }
}

export async function ensureDirectoryMetadata(
  directoryPath: string,
  metadataFileName: string,
  name: string
): Promise<{ createdDirectory: boolean; metadataPath: string }> {
  const hasDirectory = await fileExists(directoryPath);
  if (!hasDirectory) {
    await fs.mkdir(directoryPath, { recursive: true });
  }

  const metadataPath = path.join(directoryPath, metadataFileName);
  const hasMetadata = await fileExists(metadataPath);
  if (!hasMetadata) {
    await writeJsonAtomic(metadataPath, { name });
  }

  return {
    createdDirectory: !hasDirectory,
    metadataPath
  };
}
