import { z } from "zod";
import { executeLogs, executeFlush } from "../../cli/commands/logs.js";
import type { LogsCommandResult, FlushCommandResult } from "../../cli/commands/logs.js";

export const logsToolName = "servherd_logs";

export const logsToolDescription =
  "Get recent log output from a server. " +
  "Use this tool to debug issues, monitor server activity, or check for errors in server output. " +
  "Can retrieve standard output logs (default) or error logs (stderr) by setting the error parameter. " +
  "Returns the server name, status, log content as a string, line count, log type (output or error), and the log file path. " +
  "Default is 50 lines but can be adjusted with the lines parameter. " +
  "Use the since parameter to filter logs by time (e.g., '1h', '30m', '2024-01-15'). " +
  "Use the head parameter to get first N lines instead of last N lines. " +
  "Use flush=true to clear logs instead of retrieving them.";

export const logsToolSchema = z.object({
  name: z.string().optional().describe("Name of the server to get logs for, e.g., 'frontend-dev' or 'api-server'. Required unless using flush with all=true."),
  lines: z.number().optional().describe("Number of lines to retrieve from the end of the log. Defaults to 50. Ignored if head is specified."),
  error: z.boolean().optional().describe("Set to true to get error logs (stderr) instead of standard output logs"),
  since: z.string().optional().describe("Filter logs since this time. Accepts duration (e.g., '1h', '30m', '2d') or ISO date (e.g., '2024-01-15')"),
  head: z.number().optional().describe("Get first N lines instead of last N lines"),
  flush: z.boolean().optional().describe("Set to true to clear/flush logs instead of retrieving them"),
  all: z.boolean().optional().describe("When flush=true, set this to true to flush logs for all servers"),
});

export type LogsToolInput = z.infer<typeof logsToolSchema>;

export interface LogsToolResult {
  name: string;
  status: string;
  logs: string;
  lineCount: number;
  logType: "output" | "error";
  logPath?: string;
}

export interface FlushToolResult {
  flushed: boolean;
  name?: string;
  all?: boolean;
  message: string;
}

export async function handleLogsTool(input: LogsToolInput): Promise<LogsToolResult | FlushToolResult> {
  // Handle flush mode
  if (input.flush) {
    const result: FlushCommandResult = await executeFlush({
      name: input.name,
      all: input.all,
    });

    return {
      flushed: result.flushed,
      name: result.name,
      all: result.all,
      message: result.message,
    };
  }

  // Handle normal logs mode
  const result: LogsCommandResult = await executeLogs({
    name: input.name,
    lines: input.lines,
    error: input.error,
    since: input.since,
    head: input.head,
  });

  const logType = input.error ? "error" : "output";
  const logPath = input.error ? result.errLogPath : result.outLogPath;

  // Count actual lines in the logs
  const lineCount = result.logs ? result.logs.split("\n").filter((line) => line.length > 0).length : 0;

  return {
    name: result.name,
    status: result.status,
    logs: result.logs,
    lineCount,
    logType,
    logPath,
  };
}
