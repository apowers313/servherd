import { z } from "zod";
import { executeRefresh } from "../../cli/commands/refresh.js";
import type { RefreshResult as CommandRefreshResult } from "../../cli/commands/refresh.js";

export const refreshToolName = "servherd_refresh";

export const refreshToolDescription =
  "Refresh servers with updated configuration. " +
  "Use this tool when global config values (like hostname, httpsCert, httpsKey) have changed and you want to apply those changes to running servers. " +
  "Servers that use config values in their command templates will be restarted with the new values. " +
  "Use the dryRun option to preview which servers would be affected without making changes. " +
  "Returns a list of results for each server with success status and a summary message.";

export const refreshToolSchema = z.object({
  name: z.string().optional().describe("Name of a specific server to refresh, e.g., 'frontend-dev' or 'api-server'"),
  tag: z.string().optional().describe("Refresh all servers with this tag that have drift, e.g., 'frontend' or 'development'"),
  all: z.boolean().optional().describe("Set to true to refresh all servers with drift"),
  dryRun: z.boolean().optional().describe("Set to true to preview what would be refreshed without making changes"),
});

export type RefreshToolInput = z.infer<typeof refreshToolSchema>;

export interface RefreshResult {
  name: string;
  success: boolean;
  status?: string;
  message?: string;
  driftDetails?: string;
  skipped?: boolean;
}

export interface RefreshToolResult {
  results: RefreshResult[];
  summary: string;
}

export async function handleRefreshTool(input: RefreshToolInput): Promise<RefreshToolResult> {
  const commandResults: CommandRefreshResult[] = await executeRefresh({
    name: input.name,
    tag: input.tag,
    all: input.all,
    dryRun: input.dryRun,
  });

  const results: RefreshResult[] = commandResults.map((r) => ({
    name: r.name,
    success: r.success,
    status: r.status,
    message: r.message,
    driftDetails: r.driftDetails,
    skipped: r.skipped,
  }));

  // Check if this is a "no drift" result
  if (results.length === 1 && results[0].skipped && results[0].name === "") {
    return {
      results: [],
      summary: results[0].message || "No servers have config drift",
    };
  }

  const successCount = results.filter((r) => r.success && !r.skipped).length;
  const skippedCount = results.filter((r) => r.skipped).length;
  const failedCount = results.filter((r) => !r.success).length;

  let summary: string;
  if (input.dryRun) {
    summary = `Dry run: ${skippedCount} server${skippedCount !== 1 ? "s" : ""} would be refreshed`;
  } else if (failedCount > 0) {
    summary = `Refreshed ${successCount} server${successCount !== 1 ? "s" : ""}, ${failedCount} failed`;
  } else {
    summary = `Successfully refreshed ${successCount} server${successCount !== 1 ? "s" : ""}`;
  }

  return {
    results,
    summary,
  };
}
