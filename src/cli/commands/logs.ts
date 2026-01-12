import { readFile } from "fs/promises";
import { pathExists } from "fs-extra/esm";
import { RegistryService } from "../../services/registry.service.js";
import { ProcessService } from "../../services/process.service.js";
import type { ServerStatus } from "../../types/registry.js";
import { formatLogs, formatError, formatWarning, formatSuccess } from "../output/formatters.js";
import { formatAsJson, formatErrorAsJson } from "../output/json-formatter.js";
import { logger } from "../../utils/logger.js";
import { followLog } from "../../utils/log-follower.js";
import { parseTimeFilter, filterLogsByTime } from "../../utils/time-parser.js";
import { ServherdError, ServherdErrorCode } from "../../types/errors.js";

const DEFAULT_LINES = 50;

export interface LogsCommandOptions {
  name?: string;
  lines?: number;
  error?: boolean;
  follow?: boolean;
  since?: string;
  head?: number;
  flush?: boolean;
  all?: boolean;
}

export interface LogsCommandResult {
  name: string;
  status: ServerStatus;
  logs: string;
  lines: number;
  outLogPath?: string;
  errLogPath?: string;
}

export interface FlushCommandResult {
  flushed: boolean;
  name?: string;
  all?: boolean;
  message: string;
}

/**
 * Parse timestamp from PM2-style log lines.
 * PM2 outputs timestamps in ISO 8601 format: 2026-01-11T09:51:49.598-08:00: message
 * Returns null if no timestamp is found.
 */
function parseLogTimestamp(line: string): Date | null {
  // PM2 format: "2026-01-11T09:51:49.598-08:00: message"
  // Extract everything before the first ": " as potential timestamp
  const colonIndex = line.indexOf(": ");
  if (colonIndex === -1) {
    return null;
  }

  const potentialTimestamp = line.substring(0, colonIndex);
  const date = new Date(potentialTimestamp);

  if (!isNaN(date.getTime())) {
    return date;
  }

  return null;
}

/**
 * Execute flush command to clear logs
 */
export async function executeFlush(options: LogsCommandOptions): Promise<FlushCommandResult> {
  const registryService = new RegistryService();
  const processService = new ProcessService();

  try {
    await processService.connect();

    if (options.all) {
      await processService.flush();
      return {
        flushed: true,
        all: true,
        message: "Logs flushed for all servers",
      };
    }

    if (!options.name) {
      throw new ServherdError(
        ServherdErrorCode.COMMAND_MISSING_ARGUMENT,
        "Server name is required (or use --all to flush all logs)",
      );
    }

    // Load registry to verify server exists
    await registryService.load();
    const server = registryService.findByName(options.name);

    if (!server) {
      throw new ServherdError(
        ServherdErrorCode.SERVER_NOT_FOUND,
        `Server "${options.name}" not found`,
      );
    }

    await processService.flush(server.pm2Name);

    return {
      flushed: true,
      name: options.name,
      message: `Logs flushed for server "${options.name}"`,
    };
  } finally {
    processService.disconnect();
  }
}

/**
 * Execute the logs command
 */
export async function executeLogs(options: LogsCommandOptions): Promise<LogsCommandResult> {
  const registryService = new RegistryService();
  const processService = new ProcessService();

  if (!options.name) {
    throw new ServherdError(
      ServherdErrorCode.COMMAND_MISSING_ARGUMENT,
      "Server name is required",
    );
  }

  try {
    // Load registry
    await registryService.load();

    // Find server by name
    const server = registryService.findByName(options.name);

    if (!server) {
      throw new ServherdError(
        ServherdErrorCode.SERVER_NOT_FOUND,
        `Server "${options.name}" not found`,
      );
    }

    // Connect to PM2 to get process details
    await processService.connect();

    // Get process info from PM2
    const procDesc = await processService.describe(server.pm2Name);

    const lines = options.lines ?? DEFAULT_LINES;
    let outLogPath: string | undefined;
    let errLogPath: string | undefined;
    let status: ServerStatus = "unknown";
    let logs = "";

    if (procDesc) {
      const pm2Env = procDesc.pm2_env;
      outLogPath = pm2Env.pm_out_log_path;
      errLogPath = pm2Env.pm_err_log_path;

      status = pm2Env.status === "online" ? "online"
        : pm2Env.status === "stopped" || pm2Env.status === "stopping" ? "stopped"
          : pm2Env.status === "errored" ? "errored"
            : "unknown";

      // Read the appropriate log file
      const logPath = options.error ? errLogPath : outLogPath;

      if (logPath) {
        try {
          const exists = await pathExists(logPath);
          if (exists) {
            const content = await readFile(logPath, "utf-8");
            // Filter out empty strings caused by trailing newlines
            let allLines = content.split("\n").filter((line) => line.length > 0);

            // Apply --since filter if specified
            if (options.since) {
              const sinceDate = parseTimeFilter(options.since);
              allLines = filterLogsByTime(allLines, sinceDate, parseLogTimestamp);
            }

            // Apply --head or --lines
            if (options.head !== undefined) {
              // --head shows first N lines
              const headLines = allLines.slice(0, options.head);
              logs = headLines.join("\n");
            } else {
              // Default: --lines shows last N lines
              const lastLines = allLines.slice(-lines);
              logs = lastLines.join("\n");
            }
          } else {
            logs = "(log file does not exist)";
          }
        } catch (error) {
          logger.debug({ error, logPath }, "Failed to read log file");
          logs = "(failed to read log file)";
        }
      } else {
        logs = "(no log path available)";
      }
    } else {
      logs = "(process not found in PM2)";
    }

    return {
      name: options.name,
      status,
      logs,
      lines: options.head ?? lines,
      outLogPath,
      errLogPath,
    };
  } finally {
    processService.disconnect();
  }
}

/**
 * CLI action handler for logs command
 */
export async function logsAction(
  name: string | undefined,
  options: {
    lines?: number;
    error?: boolean;
    follow?: boolean;
    since?: string;
    head?: number;
    flush?: boolean;
    all?: boolean;
    json?: boolean;
  },
): Promise<void> {
  try {
    // Handle --flush option
    if (options.flush) {
      const result = await executeFlush({ name, all: options.all });

      if (options.json) {
        console.log(formatAsJson(result));
      } else {
        console.log(formatSuccess(result.message));
      }
      return;
    }

    // Validate that name is provided for non-flush operations
    if (!name) {
      const error = new ServherdError(
        ServherdErrorCode.COMMAND_MISSING_ARGUMENT,
        "Server name is required",
      );
      if (options.json) {
        console.log(formatErrorAsJson(error));
      } else {
        console.error(formatError(error.message));
      }
      process.exitCode = 1;
      return;
    }

    // Handle --follow option
    if (options.follow && !options.json) {
      await handleFollowMode(name, options);
      return;
    }

    if (options.follow && options.json) {
      // Follow mode doesn't work well with JSON output
      console.log(formatWarning("The --follow flag is not supported with --json output. Showing static logs."));
    }

    const result = await executeLogs({
      name,
      lines: options.lines,
      error: options.error,
      follow: options.follow,
      since: options.since,
      head: options.head,
    });

    if (options.json) {
      console.log(formatAsJson(result));
    } else {
      console.log(formatLogs(result));
    }
  } catch (error) {
    if (options.json) {
      console.log(formatErrorAsJson(error));
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(formatError(message));
    }
    logger.error({ error }, "Logs command failed");
    process.exitCode = 1;
  }
}

/**
 * Handle follow mode for logs
 */
async function handleFollowMode(
  name: string,
  options: {
    error?: boolean;
    since?: string;
  },
): Promise<void> {
  const registryService = new RegistryService();
  const processService = new ProcessService();

  try {
    await registryService.load();
    const server = registryService.findByName(name);

    if (!server) {
      console.error(formatError(`Server "${name}" not found`));
      process.exitCode = 1;
      return;
    }

    await processService.connect();
    const procDesc = await processService.describe(server.pm2Name);

    if (!procDesc) {
      console.error(formatError(`Process not found in PM2 for "${name}"`));
      process.exitCode = 1;
      return;
    }

    const logPath = options.error
      ? procDesc.pm2_env.pm_err_log_path
      : procDesc.pm2_env.pm_out_log_path;

    if (!logPath) {
      console.error(formatError("No log path available"));
      process.exitCode = 1;
      return;
    }

    const exists = await pathExists(logPath);
    if (!exists) {
      console.error(formatError(`Log file does not exist: ${logPath}`));
      process.exitCode = 1;
      return;
    }

    console.log(formatWarning(`Following logs for "${name}" (Ctrl+C to stop)...`));
    console.log("");

    // Set up abort controller for graceful shutdown
    const controller = new AbortController();

    // Handle SIGINT (Ctrl+C)
    const handleSignal = () => {
      controller.abort();
    };

    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);

    // Optional: parse --since for filtering live logs
    let sinceDate: Date | undefined;
    if (options.since) {
      sinceDate = parseTimeFilter(options.since);
    }

    try {
      await followLog(logPath, controller.signal, (line) => {
        // Filter by time if --since is specified
        if (sinceDate) {
          const timestamp = parseLogTimestamp(line);
          if (timestamp && timestamp < sinceDate) {
            return; // Skip old lines
          }
        }
        console.log(line);
      });
    } finally {
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
    }

    console.log("");
    console.log(formatSuccess("Stopped following logs."));
  } finally {
    processService.disconnect();
  }
}
