import { RegistryService } from "../../services/registry.service.js";
import { ProcessService } from "../../services/process.service.js";
import type { ServerEntry } from "../../types/registry.js";
import { formatStopResult, type StopResult } from "../output/formatters.js";
import { formatAsJson, formatErrorAsJson } from "../output/json-formatter.js";
import { logger } from "../../utils/logger.js";

export interface StopCommandOptions {
  name?: string;
  all?: boolean;
  tag?: string;
  force?: boolean;
}

/**
 * Execute the stop command
 */
export async function executeStop(options: StopCommandOptions): Promise<StopResult[]> {
  const registryService = new RegistryService();
  const processService = new ProcessService();
  const results: StopResult[] = [];

  try {
    await registryService.load();
    await processService.connect();

    let serversToStop: ServerEntry[] = [];

    if (options.all) {
      serversToStop = registryService.listServers();
    } else if (options.tag) {
      serversToStop = registryService.listServers({ tag: options.tag });
    } else if (options.name) {
      const server = registryService.findByName(options.name);
      if (server) {
        serversToStop = [server];
      } else {
        return [{
          name: options.name,
          success: false,
          message: `Server "${options.name}" not found in registry`,
        }];
      }
    }

    for (const server of serversToStop) {
      try {
        // Use delete (SIGKILL) when force is specified, otherwise use stop (SIGTERM)
        if (options.force) {
          await processService.delete(server.pm2Name);
        } else {
          await processService.stop(server.pm2Name);
        }
        results.push({
          name: server.name,
          success: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          name: server.name,
          success: false,
          message,
        });
      }
    }

    return results;
  } finally {
    processService.disconnect();
  }
}

/**
 * CLI action handler for stop command
 */
export async function stopAction(
  name: string | undefined,
  options: { all?: boolean; tag?: string; force?: boolean; json?: boolean },
): Promise<void> {
  try {
    if (!name && !options.all && !options.tag) {
      if (options.json) {
        console.log(formatErrorAsJson(new Error("Provide a server name, --all, or --tag")));
      } else {
        console.error("Error: Provide a server name, --all, or --tag");
      }
      process.exitCode = 1;
      return;
    }

    const results = await executeStop({
      name,
      all: options.all,
      tag: options.tag,
      force: options.force,
    });

    if (options.json) {
      console.log(formatAsJson({ results }));
    } else {
      console.log(formatStopResult(results));
    }

    // Set exit code if any failures
    if (results.some((r) => !r.success)) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (options.json) {
      console.log(formatErrorAsJson(error));
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
    }
    logger.error({ error }, "Stop command failed");
    process.exitCode = 1;
  }
}
