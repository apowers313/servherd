import { RegistryService } from "../../services/registry.service.js";
import { ProcessService } from "../../services/process.service.js";
import { ConfigService } from "../../services/config.service.js";
import { formatServerListTable, type ServerListItem } from "../output/formatters.js";
import { formatAsJson, formatErrorAsJson } from "../output/json-formatter.js";
import { logger } from "../../utils/logger.js";
import { ServherdError, ServherdErrorCode } from "../../types/errors.js";
import { detectDrift } from "../../utils/config-drift.js";

export interface ListCommandOptions {
  running?: boolean;
  stopped?: boolean;
  tag?: string;
  cwd?: string;
  cmd?: string;
}

export interface ListCommandResult {
  servers: ServerListItem[];
}

/**
 * Execute the list command
 */
export async function executeList(options: ListCommandOptions): Promise<ListCommandResult> {
  // Validate mutually exclusive options
  if (options.running && options.stopped) {
    throw new ServherdError(
      ServherdErrorCode.COMMAND_CONFLICT,
      "Cannot specify both --running and --stopped",
    );
  }

  const registryService = new RegistryService();
  const processService = new ProcessService();
  const configService = new ConfigService();

  try {
    await registryService.load();
    await processService.connect();
    const config = await configService.load();

    // Get servers from registry with optional filters
    const servers = registryService.listServers({
      tag: options.tag,
      cwd: options.cwd,
      cmd: options.cmd,
    });

    // Get status for each server
    const serverListItems: ServerListItem[] = [];

    for (const server of servers) {
      const status = await processService.getStatus(server.pm2Name);

      // Filter by running status if requested
      if (options.running && status !== "online") {
        continue;
      }

      // Filter by stopped status if requested
      if (options.stopped && status !== "stopped") {
        continue;
      }

      // Detect config drift
      const drift = detectDrift(server, config);

      serverListItems.push({
        server,
        status,
        hasDrift: drift.hasDrift,
      });
    }

    return { servers: serverListItems };
  } finally {
    processService.disconnect();
  }
}

/**
 * CLI action handler for list command
 */
export async function listAction(options: {
  running?: boolean;
  stopped?: boolean;
  tag?: string;
  cwd?: string;
  cmd?: string;
  json?: boolean;
}): Promise<void> {
  try {
    const result = await executeList({
      running: options.running,
      stopped: options.stopped,
      tag: options.tag,
      cwd: options.cwd,
      cmd: options.cmd,
    });

    if (options.json) {
      console.log(formatAsJson(result));
    } else {
      console.log(formatServerListTable(result.servers));
    }
  } catch (error) {
    if (options.json) {
      console.log(formatErrorAsJson(error));
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
    }
    logger.error({ error }, "List command failed");
    process.exitCode = 1;
  }
}
