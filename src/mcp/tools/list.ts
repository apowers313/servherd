import { z } from "zod";
import { executeList } from "../../cli/commands/list.js";
import type { ServerListItem } from "../../cli/output/formatters.js";

export const listToolName = "servherd_list";

export const listToolDescription =
  "List all managed development servers with their current status. " +
  "Use this tool to get an overview of all servers, check which servers are running, or find servers by tag, location, or command. " +
  "Can filter to show only running servers, servers with a specific tag, servers in a particular directory, or servers matching a command pattern (e.g., '*storybook*'). " +
  "Returns an array of server objects with name, status (online/stopped/errored), port, URL, working directory, command, and tags. " +
  "Also includes a count and summary message.";

export const listToolSchema = z.object({
  running: z.boolean().optional().describe("Set to true to only show servers that are currently running"),
  stopped: z.boolean().optional().describe("Set to true to only show servers that are currently stopped"),
  tag: z.string().optional().describe("Filter by tag, e.g., 'frontend' or 'api'"),
  cwd: z.string().optional().describe("Filter by working directory, e.g., '/home/user/projects/my-app'"),
  cmd: z.string().optional().describe("Filter by command pattern using glob syntax, e.g., '*storybook*' or '*vite*'"),
});

export type ListToolInput = z.infer<typeof listToolSchema>;

export interface ServerInfo {
  name: string;
  status: string;
  port: number;
  url: string;
  cwd: string;
  command: string;
  tags?: string[];
  hasDrift?: boolean;
}

export interface ListToolResult {
  servers: ServerInfo[];
  count: number;
  summary: string;
}

export async function handleListTool(input: ListToolInput): Promise<ListToolResult> {
  const result = await executeList({
    running: input.running,
    stopped: input.stopped,
    tag: input.tag,
    cwd: input.cwd,
    cmd: input.cmd,
  });

  const servers: ServerInfo[] = result.servers.map((item: ServerListItem) => ({
    name: item.server.name,
    status: item.status,
    port: item.server.port,
    url: `${item.server.protocol}://${item.server.hostname}:${item.server.port}`,
    cwd: item.server.cwd,
    command: item.server.command,
    tags: item.server.tags,
    hasDrift: item.hasDrift,
  }));

  const runningCount = servers.filter((s) => s.status === "online").length;
  const driftCount = servers.filter((s) => s.hasDrift).length;

  let summary: string;
  if (servers.length === 0) {
    summary = "No servers found";
  } else {
    summary = `${servers.length} server${servers.length !== 1 ? "s" : ""} (${runningCount} running)`;
    if (driftCount > 0) {
      summary += `. ${driftCount} server${driftCount !== 1 ? "s have" : " has"} config drift - use servherd_restart to apply new config`;
    }
  }

  return {
    servers,
    count: servers.length,
    summary,
  };
}
