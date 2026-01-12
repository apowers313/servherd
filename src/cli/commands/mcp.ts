import { startStdioServer } from "../../mcp/index.js";
import { logger } from "../../utils/logger.js";

/**
 * CLI action handler for mcp command
 * Starts the MCP server in stdio mode for use with Claude Code or other MCP clients
 */
export async function mcpAction(): Promise<void> {
  try {
    await startStdioServer();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Don't use console.error as it would interfere with stdio transport
    logger.error({ error }, "MCP server failed: " + message);
    process.exitCode = 1;
  }
}
