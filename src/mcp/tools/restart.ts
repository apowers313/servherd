import { z } from "zod";
import { executeRestart } from "../../cli/commands/restart.js";
import type { RestartResult } from "../../cli/commands/restart.js";

export const restartToolName = "servherd_restart";

export const restartToolDescription =
  "Restart one or more development servers. " +
  "Use this tool when servers need to pick up configuration changes, clear memory, or recover from an error state. " +
  "Can target a specific server by name, all servers with a particular tag, or all managed servers at once. " +
  "Returns a list of results for each server with success status and a summary message. " +
  "Servers maintain their assigned ports and configuration across restarts.";

export const restartToolSchema = z.object({
  name: z.string().optional().describe("Name of the server to restart, e.g., 'frontend-dev' or 'api-server'"),
  all: z.boolean().optional().describe("Set to true to restart all managed servers"),
  tag: z.string().optional().describe("Restart all servers with this tag, e.g., 'backend' or 'production'"),
});

export type RestartToolInput = z.infer<typeof restartToolSchema>;

export interface RestartToolResult {
  results: RestartResult[];
  summary: string;
}

export async function handleRestartTool(input: RestartToolInput): Promise<RestartToolResult> {
  // Validate input
  if (!input.name && !input.all && !input.tag) {
    throw new Error("Either name, all, or tag must be provided");
  }

  const result = await executeRestart({
    name: input.name,
    all: input.all,
    tag: input.tag,
  });

  // Normalize to array
  const results = Array.isArray(result) ? result : [result];

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;

  let summary: string;
  if (results.length === 0) {
    summary = "No servers found to restart";
  } else if (failCount === 0) {
    summary = `Successfully restarted ${successCount} server${successCount !== 1 ? "s" : ""}`;
  } else {
    summary = `Restarted ${successCount} server${successCount !== 1 ? "s" : ""}, ${failCount} failed`;
  }

  return {
    results,
    summary,
  };
}
