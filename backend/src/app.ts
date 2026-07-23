import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";

import { IndexStore } from "./services/indexer/indexStore";
import { createApiRouter } from "./api/router";
import { errorHandler } from "./middleware/errorHandler";

function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN ?? "http://localhost:5173";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Resolve the Express `trust proxy` setting from TRUST_PROXY.
 *
 * The client IP feeds rate-limiting and audit logs, so it must not be forgeable
 * by a spoofed `X-Forwarded-For`. Default to `false` (trust nothing): `req.ip`
 * is then the direct socket peer and headers are ignored. Behind a reverse
 * proxy set TRUST_PROXY explicitly — `1` for a single hop (our nginx frontend),
 * a larger hop count, or a comma-separated allowlist of proxy IPs/subnets.
 */
export function resolveTrustProxySetting(raw: string | undefined): boolean | number | string {
  const value = (raw ?? "").trim();
  if (!value) {
    return false;
  }

  const lowered = value.toLowerCase();
  if (["false", "0", "no", "off"].includes(lowered)) {
    return false;
  }
  if (["true", "on", "yes"].includes(lowered)) {
    return true;
  }

  // A bare integer is a hop count (number of proxies in front of the app).
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  // Otherwise defer to Express/proxy-addr: a comma-separated list of trusted
  // IPs/subnets or keywords like "loopback", "linklocal", "uniquelocal".
  return value;
}

export function createApp(indexStore: IndexStore): express.Express {
  const app = express();

  // Derive req.ip from the configured proxy chain rather than a raw header.
  app.set("trust proxy", resolveTrustProxySetting(process.env.TRUST_PROXY));

  // Security headers on every response. This backend serves JSON and media
  // (covers/audio) rather than HTML documents, so:
  // - CSP is disabled here; the SPA (served by the nginx frontend) owns the
  //   document Content-Security-Policy.
  // - Cross-Origin-Resource-Policy is relaxed to cross-origin so the SPA on a
  //   different origin can embed cover art and audio streams.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" }
    })
  );

  const allowedOrigins = parseAllowedOrigins();

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", createApiRouter(indexStore));

  app.use(errorHandler);

  return app;
}
