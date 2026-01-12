import { z } from "zod";
import { executeInfo } from "../../cli/commands/info.js";
import type { InfoCommandResult } from "../../cli/commands/info.js";

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

function formatUptime(ms: number | undefined): string | undefined {
  if (ms === undefined) {
    return undefined;
  }

  const seconds = Math.floor((Date.now() - ms) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatMemory(bytes: number | undefined): string | undefined {
  if (bytes === undefined) {
    return undefined;
  }

  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
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
