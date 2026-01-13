import { z } from "zod";
import { executeInfo } from "../../cli/commands/info.js";
import type { InfoCommandResult } from "../../cli/commands/info.js";
import { formatUptime as formatUptimeShared, formatBytes as formatBytesShared } from "../../utils/format.js";

export const infoToolName = "servherd_info";

export const infoToolDescription =
  "Get detailed information about a specific server. " +
  "Use this tool when you need comprehensive details about a server's configuration, health, or resource usage. " +
  "Returns status, port, URL, working directory, command, process ID, uptime (raw and formatted), restart count, memory usage (raw bytes and formatted), CPU percentage, tags, description, and log file paths. " +
  "This provides more detail than servherd_list which gives a summary of all servers.";

export const infoToolSchema = z.object({
  name: z.string().describe("Name of the server to get info for, e.g., 'frontend-dev' or 'brave-tiger'"),
});

export type InfoToolInput = z.infer<typeof infoToolSchema>;

export interface InfoToolResult {
  name: string;
  status: string;
  url: string;
  cwd: string;
  command: string;
  resolvedCommand: string;
  port: number;
  hostname: string;
  protocol: string;
  pid?: number;
  uptime?: number;
  uptimeFormatted?: string;
  restarts?: number;
  memory?: number;
  memoryFormatted?: string;
  cpu?: number;
  tags?: string[];
  description?: string;
  createdAt: string;
  pm2Name: string;
  outLogPath?: string;
  errLogPath?: string;
}

/**
 * Format uptime from a start timestamp
 * Uses shared utility from utils/format.ts
 */
function formatUptime(startTimestamp: number | undefined): string | undefined {
  if (startTimestamp === undefined) {
    return undefined;
  }

  const durationMs = Date.now() - startTimestamp;
  return formatUptimeShared(durationMs);
}

/**
 * Format memory in bytes to human readable string
 * Uses shared utility from utils/format.ts
 */
function formatMemory(bytes: number | undefined): string | undefined {
  if (bytes === undefined) {
    return undefined;
  }

  return formatBytesShared(bytes);
}

export async function handleInfoTool(input: InfoToolInput): Promise<InfoToolResult> {
  const result: InfoCommandResult = await executeInfo({
    name: input.name,
  });

  return {
    name: result.name,
    status: result.status,
    url: result.url,
    cwd: result.cwd,
    command: result.command,
    resolvedCommand: result.resolvedCommand,
    port: result.port,
    hostname: result.hostname,
    protocol: result.protocol,
    pid: result.pid,
    uptime: result.uptime,
    uptimeFormatted: formatUptime(result.uptime),
    restarts: result.restarts,
    memory: result.memory,
    memoryFormatted: formatMemory(result.memory),
    cpu: result.cpu,
    tags: result.tags,
    description: result.description,
    createdAt: result.createdAt,
    pm2Name: result.pm2Name,
    outLogPath: result.outLogPath,
    errLogPath: result.errLogPath,
  };
}
