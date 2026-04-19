import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";

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

export function createApp(indexStore: IndexStore): express.Express {
  const app = express();

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
