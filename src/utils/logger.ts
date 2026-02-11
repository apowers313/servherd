import pino, { type Logger } from "pino";

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface LoggerOptions {
  level?: LogLevel;
  pretty?: boolean;
}

/**
 * Create a configured pino logger instance.
 * All log output is sent to stderr so it doesn't interfere with
 * stdout-based protocols like MCP stdio transport.
 */
export function createLogger(options: LoggerOptions): Logger {
  const level = options.level ?? "info";
  const pretty = options.pretty ?? process.env.NODE_ENV !== "production";

  if (pretty) {
    return pino({
      level,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
          destination: 2,
        },
      },
    });
  }

  return pino({ level }, pino.destination(2));
}

// Export a default logger instance
export const logger = createLogger({ level: "info" });
