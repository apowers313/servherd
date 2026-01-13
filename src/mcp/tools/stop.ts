import { z } from "zod";
import { executeStop } from "../../cli/commands/stop.js";
import type { StopResult } from "../../cli/output/formatters.js";

export const stopToolName = "servherd_stop";

export const stopToolDescription =
  "Stop one or more running development servers. " +
  "Use this tool when you need to gracefully shut down servers that are no longer needed or before making configuration changes. " +
  "Can target a specific server by name, all servers with a particular tag, or all managed servers at once. " +
  "Returns a list of results for each server with success status and a summary message. " +
  "Stopped servers remain in the registry and can be restarted later with servherd_start.";

export const stopToolSchema = z.object({
  name: z.string().optional().describe("Name of the server to stop, e.g., 'frontend-dev' or 'brave-tiger'"),
  all: z.boolean().optional().describe("Set to true to stop all managed servers"),
  tag: z.string().optional().describe("Stop all servers with this tag, e.g., 'frontend' or 'development'"),
  force: z.boolean().optional().describe("Force stop using SIGKILL instead of SIGTERM"),
});

export type StopToolInput = z.infer<typeof stopToolSchema>;

export interface StopToolResult {
  results: StopResult[];
  summary: string;
}

export async function handleStopTool(input: StopToolInput): Promise<StopToolResult> {
  // Validate input
  if (!input.name && !input.all && !input.tag) {
    throw new Error("Either name, all, or tag must be provided");
  }

  const results = await executeStop({
    name: input.name,
    all: input.all,
    tag: input.tag,
    force: input.force,
  });

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;

  let summary: string;
  if (results.length === 0) {
    summary = "No servers found to stop";
  } else if (failCount === 0) {
    summary = `Successfully stopped ${successCount} server${successCount !== 1 ? "s" : ""}`;
  } else {
    summary = `Stopped ${successCount} server${successCount !== 1 ? "s" : ""}, ${failCount} failed`;
  }

  return {
    results,
    summary,
  };
}
