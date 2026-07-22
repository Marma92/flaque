import path from "node:path";

import pino from "pino";

import { logsRoot } from "./paths";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
};

function resolveLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }

  return process.env.NODE_ENV === "test" ? "error" : "info";
}

function resolveLogFilePath(): string {
  const explicit = (process.env.LOG_FILE ?? "").trim();
  if (explicit) {
    return explicit;
  }

  return path.join(logsRoot, "flaque.log");
}

function buildTransport(): pino.TransportMultiOptions {
  const logFile = resolveLogFilePath();
  const level = resolveLogLevel();
  const rotationFrequency = (process.env.LOG_ROTATION_FREQUENCY ?? "daily").trim();
  const parsedMaxFiles = Number(process.env.LOG_ROTATION_MAX_FILES ?? 14);
  const maxFiles = Number.isFinite(parsedMaxFiles) && parsedMaxFiles > 0 ? Math.floor(parsedMaxFiles) : 14;
  const rotationMaxSize = (process.env.LOG_ROTATION_MAX_SIZE ?? "").trim();

  const stdoutTarget = { target: "pino/file", options: { destination: 1 }, level };

  // Under test we skip the rotating file transport: its worker keeps the log
  // file open, which blocks temp-dir cleanup on Windows (ENOTEMPTY) and serves
  // no purpose in a test run.
  if (process.env.NODE_ENV === "test") {
    return { targets: [stdoutTarget] };
  }

  return {
    targets: [
      stdoutTarget,
      {
        target: "pino-roll",
        options: {
          file: logFile,
          frequency: rotationFrequency,
          limit: { count: maxFiles },
          ...(rotationMaxSize ? { size: rotationMaxSize } : {}),
          mkdir: true
        },
        level
      }
    ]
  };
}

let rootLogger: pino.Logger | undefined;

function getRootLogger(): pino.Logger {
  if (!rootLogger) {
    rootLogger = pino({
      level: resolveLogLevel(),
      transport: buildTransport()
    });
  }

  return rootLogger;
}

export function createLogger(context: string): Logger {
  const child = getRootLogger().child({ context });

  return {
    debug(message, data) {
      if (data) {
        child.debug(data, message);
      } else {
        child.debug(message);
      }
    },
    info(message, data) {
      if (data) {
        child.info(data, message);
      } else {
        child.info(message);
      }
    },
    warn(message, data) {
      if (data) {
        child.warn(data, message);
      } else {
        child.warn(message);
      }
    },
    error(message, data) {
      if (data) {
        child.error(data, message);
      } else {
        child.error(message);
      }
    }
  };
}

export function resetLogLevel(): void {
  rootLogger = undefined;
}
