export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

function resolveLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").trim().toLowerCase();
  if (raw in LOG_LEVEL_PRIORITY) {
    return raw as LogLevel;
  }

  return process.env.NODE_ENV === "test" ? "error" : "info";
}

let currentLogLevel: LogLevel | undefined;

function getLogLevel(): LogLevel {
  if (currentLogLevel === undefined) {
    currentLogLevel = resolveLogLevel();
  }

  return currentLogLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[getLogLevel()];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, context: string, message: string, data?: Record<string, unknown>): string {
  const parts = [`${formatTimestamp()} [${level.toUpperCase()}] [${context}] ${message}`];

  if (data && Object.keys(data).length > 0) {
    parts.push(` ${JSON.stringify(data)}`);
  }

  return parts.join("");
}

export type Logger = {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
};

export function createLogger(context: string): Logger {
  return {
    debug(message, data) {
      if (shouldLog("debug")) {
        console.debug(formatMessage("debug", context, message, data));
      }
    },
    info(message, data) {
      if (shouldLog("info")) {
        console.info(formatMessage("info", context, message, data));
      }
    },
    warn(message, data) {
      if (shouldLog("warn")) {
        console.warn(formatMessage("warn", context, message, data));
      }
    },
    error(message, data) {
      if (shouldLog("error")) {
        console.error(formatMessage("error", context, message, data));
      }
    }
  };
}

export function resetLogLevel(): void {
  currentLogLevel = undefined;
}
