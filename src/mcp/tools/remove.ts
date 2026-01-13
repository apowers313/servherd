import { z } from "zod";
import { executeRemove } from "../../cli/commands/remove.js";
import type { RemoveResult } from "../../cli/output/formatters.js";

export const removeToolName = "servherd_remove";

export const removeToolDescription =
  "Permanently remove servers from the registry and process management. " +
  "Use this tool when a server is no longer needed and should be completely removed, not just stopped. " +
  "This stops the server process, removes it from PM2, and deletes it from the servherd registry. " +
  "Can target a specific server by name, all servers with a particular tag, or all managed servers at once. " +
  "Returns a list of results for each server with success status and a summary message. " +
  "Unlike servherd_stop, removed servers cannot be restarted without starting them again from scratch.";

export const removeToolSchema = z.object({
  name: z.string().optional().describe("Name of the server to remove, e.g., 'frontend-dev' or 'brave-tiger'"),
  all: z.boolean().optional().describe("Set to true to remove all managed servers"),
  tag: z.string().optional().describe("Remove all servers with this tag, e.g., 'temporary' or 'test'"),
  force: z.boolean().optional().describe("Skip confirmation (always true in MCP context)"),
});

export type RemoveToolInput = z.infer<typeof removeToolSchema>;

export interface RemoveToolResult {
  results: RemoveResult[];
  summary: string;
}

export async function handleRemoveTool(input: RemoveToolInput): Promise<RemoveToolResult> {
  // Validate input
  if (!input.name && !input.all && !input.tag) {
    throw new Error("Either name, all, or tag must be provided");
  }

  // Always force in MCP context since we can't prompt
  const results = await executeRemove({
    name: input.name,
    all: input.all,
    tag: input.tag,
    force: true, // MCP context can't prompt for confirmation
  });

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success && !r.cancelled).length;

  let summary: string;
  if (results.length === 0) {
    summary = "No servers found to remove";
  } else if (failCount === 0) {
    summary = `Successfully removed ${successCount} server${successCount !== 1 ? "s" : ""}`;
  } else {
    summary = `Removed ${successCount} server${successCount !== 1 ? "s" : ""}, ${failCount} failed`;
  }

  return {
    results,
    summary,
  };
}
