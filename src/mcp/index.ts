import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  startToolName,
  startToolDescription,
  startToolSchema,
  handleStartTool,
} from "./tools/start.js";

import {
  stopToolName,
  stopToolDescription,
  stopToolSchema,
  handleStopTool,
} from "./tools/stop.js";

import {
  restartToolName,
  restartToolDescription,
  restartToolSchema,
  handleRestartTool,
} from "./tools/restart.js";

import {
  listToolName,
  listToolDescription,
  listToolSchema,
  handleListTool,
} from "./tools/list.js";

import {
  infoToolName,
  infoToolDescription,
  infoToolSchema,
  handleInfoTool,
} from "./tools/info.js";

import {
  logsToolName,
  logsToolDescription,
  logsToolSchema,
  handleLogsTool,
} from "./tools/logs.js";

import {
  configToolName,
  configToolDescription,
  configToolSchema,
  handleConfigTool,
} from "./tools/config.js";

import {
  removeToolName,
  removeToolDescription,
  removeToolSchema,
  handleRemoveTool,
} from "./tools/remove.js";

import {
  refreshToolName,
  refreshToolDescription,
  refreshToolSchema,
  handleRefreshTool,
} from "./tools/refresh.js";

import {
  listServerResources,
  readServerResource,
} from "./resources/servers.js";

import { logger } from "../utils/logger.js";

export interface MCPServerOptions {
  name?: string;
  version?: string;
}

/**
 * Create and configure an MCP server for servherd
 */
export function createMCPServer(options: MCPServerOptions = {}): McpServer {
  const name = options.name || "servherd";
  const version = options.version || "0.1.0";

  const server = new McpServer(
    { name, version },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
      instructions: "servherd is a tool for managing development servers. " +
        "Use servherd_start to start a server, servherd_stop to stop it, " +
        "servherd_list to see all servers, and servherd_info to get details about a specific server.",
    },
  );

  // Register tools
  registerTools(server);

  // Register resources
  registerResources(server);

  return server;
}

/**
 * Register all tools with the MCP server
 */
function registerTools(server: McpServer): void {
  // Start tool
  server.registerTool(
    startToolName,
    {
      description: startToolDescription,
      inputSchema: startToolSchema,
    },
    async (args) => {
      try {
        const result = await handleStartTool(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error }, "MCP start tool failed");
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Stop tool
  server.registerTool(
    stopToolName,
    {
      description: stopToolDescription,
      inputSchema: stopToolSchema,
    },
    async (args) => {
      try {
        const result = await handleStopTool(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error }, "MCP stop tool failed");
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Restart tool
  server.registerTool(
    restartToolName,
    {
      description: restartToolDescription,
      inputSchema: restartToolSchema,
    },
    async (args) => {
      try {
        const result = await handleRestartTool(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error }, "MCP restart tool failed");
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // List tool
  server.registerTool(
    listToolName,
    {
      description: listToolDescription,
      inputSchema: listToolSchema,
    },
    async (args) => {
      try {
        const result = await handleListTool(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error }, "MCP list tool failed");
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Info tool
  server.registerTool(
    infoToolName,
    {
      description: infoToolDescription,
      inputSchema: infoToolSchema,
    },
    async (args) => {
      try {
        const result = await handleInfoTool(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error }, "MCP info tool failed");
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Logs tool
  server.registerTool(
    logsToolName,
    {
      description: logsToolDescription,
      inputSchema: logsToolSchema,
    },
    async (args) => {
      try {
        const result = await handleLogsTool(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error }, "MCP logs tool failed");
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Config tool
  server.registerTool(
    configToolName,
    {
      description: configToolDescription,
      inputSchema: configToolSchema,
    },
    async (args) => {
      try {
        const result = await handleConfigTool(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error }, "MCP config tool failed");
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Remove tool
  server.registerTool(
    removeToolName,
    {
      description: removeToolDescription,
      inputSchema: removeToolSchema,
    },
    async (args) => {
      try {
        const result = await handleRemoveTool(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error }, "MCP remove tool failed");
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Refresh tool
  server.registerTool(
    refreshToolName,
    {
      description: refreshToolDescription,
      inputSchema: refreshToolSchema,
    },
    async (args) => {
      try {
        const result = await handleRefreshTool(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error }, "MCP refresh tool failed");
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}

/**
 * Register resources with the MCP server
 */
function registerResources(server: McpServer): void {
  // Register server resource template for individual servers
  const serverTemplate = new ResourceTemplate(
    "servherd://servers/{name}",
    {
      list: async () => {
        const resources = await listServerResources();
        // Filter to only include server resources (not logs)
        const serverResources = resources.filter((r) => !r.uri.endsWith("/logs"));
        return {
          resources: serverResources.map((r) => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          })),
        };
      },
    },
  );

  server.registerResource(
    "Server Details",
    serverTemplate,
    {
      description: "Get details about a specific managed server",
      mimeType: "application/json",
    },
    async (uri) => {
      const content = await readServerResource(uri.toString());
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: content,
          },
        ],
      };
    },
  );

  // Register server logs resource template
  const logsTemplate = new ResourceTemplate(
    "servherd://servers/{name}/logs",
    {
      list: async () => {
        const resources = await listServerResources();
        // Filter to only include log resources
        const logResources = resources.filter((r) => r.uri.endsWith("/logs"));
        return {
          resources: logResources.map((r) => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          })),
        };
      },
    },
  );

  server.registerResource(
    "Server Logs",
    logsTemplate,
    {
      description: "Get output logs from a managed server",
      mimeType: "text/plain",
    },
    async (uri) => {
      const content = await readServerResource(uri.toString());
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/plain",
            text: content,
          },
        ],
      };
    },
  );
}

/**
 * Start the MCP server in stdio mode
 */
export async function startStdioServer(): Promise<void> {
  const server = createMCPServer();
  const transport = new StdioServerTransport();

  logger.info("Starting MCP server in stdio mode");

  await server.connect(transport);

  // Handle shutdown
  process.on("SIGINT", async () => {
    logger.info("Shutting down MCP server");
    await server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("Shutting down MCP server");
    await server.close();
    process.exit(0);
  });
}

export { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
