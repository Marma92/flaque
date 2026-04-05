import fs from "node:fs";
import fsp from "node:fs/promises";

import type { Request, Response } from "express";

type RangeBounds = {
  start: number;
  end: number;
};

export function parseRangeHeader(rangeHeader: string, fileSize: number): RangeBounds | null {
  const matches = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!matches) {
    return null;
  }

  const rawStart = matches[1];
  const rawEnd = matches[2];

  if (!rawStart && !rawEnd) {
    return null;
  }

  let start = rawStart ? Number(rawStart) : Number.NaN;
  let end = rawEnd ? Number(rawEnd) : Number.NaN;

  if (Number.isNaN(start)) {
    const suffixLength = Number(rawEnd);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }

    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else if (Number.isNaN(end)) {
    end = fileSize - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return null;
  }

  if (start < 0 || end < start || start >= fileSize) {
    return null;
  }

  end = Math.min(end, fileSize - 1);
  return { start, end };
}

export async function streamAudioWithRange(
  req: Request,
  res: Response,
  filePath: string,
  mimeType: string
): Promise<void> {
  const stat = await fsp.stat(filePath);
  const fileSize = stat.size;
  const rangeHeader = req.headers.range;

  if (!rangeHeader) {
    res.status(200);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", fileSize);
    res.setHeader("Accept-Ranges", "bytes");
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const range = parseRangeHeader(rangeHeader, fileSize);
  if (!range) {
    res.status(416);
    res.setHeader("Content-Range", `bytes */${fileSize}`);
    res.end();
    return;
  }

  const chunkSize = range.end - range.start + 1;

  res.status(206);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Length", chunkSize);
  res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${fileSize}`);

  fs.createReadStream(filePath, {
    start: range.start,
    end: range.end
  }).pipe(res);
}
