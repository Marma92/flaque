import { Router } from "express";

import { requireAdmin, requireAuth } from "../auth/middleware";
import { IndexStore } from "../services/indexer/indexStore";
import { readTrackActivityEvents } from "../services/indexer/trackActivityStore";

type ActivityWindow = "7d" | "30d";

const DEFAULT_UPLOAD_LIMIT = 24;
const MAX_UPLOAD_LIMIT = 100;
const DEFAULT_DELETION_LIMIT = 50;
const MAX_DELETION_LIMIT = 200;

function normalizeQueryValue(value: unknown): string | undefined {
  const firstValue = Array.isArray(value) ? value[0] : value;
  if (typeof firstValue !== "string") {
    return undefined;
  }

  const trimmed = firstValue.trim();
  return trimmed ? trimmed : undefined;
}

function parseActivityWindow(value: unknown): ActivityWindow | null {
  const normalized = normalizeQueryValue(value);
  if (!normalized) {
    return "7d";
  }

  if (normalized === "7d" || normalized === "30d") {
    return normalized;
  }

  return null;
}

function parsePositiveInteger(value: unknown, fallback: number, max: number): number | null {
  const normalized = normalizeQueryValue(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
    return null;
  }

  return parsed;
}

function windowToMs(window: ActivityWindow): number {
  return window === "30d" ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
}

function toTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createActivityRouter(indexStore: IndexStore): Router {
  const router = Router();

  router.get("/activity/recent-uploads", requireAuth, async (req, res, next) => {
    try {
      const window = parseActivityWindow(req.query.window);
      if (!window) {
        res.status(400).json({ error: "window must be 7d or 30d" });
        return;
      }

      const limit = parsePositiveInteger(req.query.limit, DEFAULT_UPLOAD_LIMIT, MAX_UPLOAD_LIMIT);
      if (limit === null) {
        res.status(400).json({ error: `limit must be an integer between 1 and ${MAX_UPLOAD_LIMIT}` });
        return;
      }

      const now = Date.now();
      const from = new Date(now - windowToMs(window)).toISOString();
      const fromTimestamp = toTimestamp(from);
      const allEvents = await readTrackActivityEvents();
      const snapshot = indexStore.getSnapshot();
      const tracksById = new Map(snapshot.tracks.map((track) => [track.id, track]));

      const latestUploadByTrackId = new Map<string, { at: string; ownerId: string; byUserId?: string; byUsername?: string }>();

      for (const event of allEvents) {
        if (event.type !== "uploaded") {
          continue;
        }

        const eventTimestamp = toTimestamp(event.at);
        if (eventTimestamp < fromTimestamp) {
          continue;
        }

        const current = latestUploadByTrackId.get(event.trackId);
        if (!current || eventTimestamp > toTimestamp(current.at)) {
          latestUploadByTrackId.set(event.trackId, {
            at: event.at,
            ownerId: event.ownerId,
            byUserId: event.byUserId,
            byUsername: event.byUsername
          });
        }
      }

      const items = Array.from(latestUploadByTrackId.entries())
        .map(([trackId, upload]) => {
          const track = tracksById.get(trackId);
          if (!track) {
            return null;
          }

          return {
            track,
            at: upload.at,
            ownerId: upload.ownerId,
            byUserId: upload.byUserId,
            byUsername: upload.byUsername
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((a, b) => toTimestamp(b.at) - toTimestamp(a.at))
        .slice(0, limit);

      res.json({
        window,
        from,
        count: items.length,
        items
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/activity/recent-deletions", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const window = parseActivityWindow(req.query.window);
      if (!window) {
        res.status(400).json({ error: "window must be 7d or 30d" });
        return;
      }

      const limit = parsePositiveInteger(req.query.limit, DEFAULT_DELETION_LIMIT, MAX_DELETION_LIMIT);
      if (limit === null) {
        res.status(400).json({ error: `limit must be an integer between 1 and ${MAX_DELETION_LIMIT}` });
        return;
      }

      const now = Date.now();
      const from = new Date(now - windowToMs(window)).toISOString();
      const fromTimestamp = toTimestamp(from);
      const allEvents = await readTrackActivityEvents();

      const items = allEvents
        .filter((event) => event.type === "deleted" && toTimestamp(event.at) >= fromTimestamp)
        .sort((a, b) => toTimestamp(b.at) - toTimestamp(a.at))
        .slice(0, limit)
        .map((event) => ({
          trackId: event.trackId,
          ownerId: event.ownerId,
          path: event.path,
          at: event.at,
          byUserId: event.byUserId,
          byUsername: event.byUsername
        }));

      res.json({
        window,
        from,
        count: items.length,
        items
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
