import path from "node:path";

import pino from "pino";

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

function resolveLogFilePath(): string | undefined {
  const explicit = (process.env.LOG_FILE ?? "").trim();
  if (explicit) {
    return explicit;
  }

  const dataRoot = (process.env.DATA_ROOT ?? "").trim();
  if (dataRoot && process.env.NODE_ENV === "production") {
    return path.join(path.resolve(dataRoot), "logs", "flaque.log");
  }

  return undefined;
}

function buildTransport(): pino.TransportMultiOptions | undefined {
  const logFile = resolveLogFilePath();
  if (!logFile) {
    return undefined;
  }

  const level = resolveLogLevel();
  const rotationFrequency = (process.env.LOG_ROTATION_FREQUENCY ?? "daily").trim();
  const parsedMaxFiles = Number(process.env.LOG_ROTATION_MAX_FILES ?? 14);
  const maxFiles = Number.isFinite(parsedMaxFiles) && parsedMaxFiles > 0 ? Math.floor(parsedMaxFiles) : 14;
  const rotationMaxSize = (process.env.LOG_ROTATION_MAX_SIZE ?? "").trim();

  return {
    targets: [
      { target: "pino/file", options: { destination: 1 }, level },
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
    const transport = buildTransport();
    rootLogger = pino({
      level: resolveLogLevel(),
      ...(transport ? { transport } : {})
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
