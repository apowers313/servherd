import { confirm } from "@inquirer/prompts";
import { RegistryService } from "../../services/registry.service.js";
import { ProcessService } from "../../services/process.service.js";
import type { ServerEntry } from "../../types/registry.js";
import { formatRemoveResult, type RemoveResult } from "../output/formatters.js";
import { formatAsJson, formatErrorAsJson } from "../output/json-formatter.js";
import { logger } from "../../utils/logger.js";
import { CIDetector } from "../../utils/ci-detector.js";
import { ServherdError, ServherdErrorCode } from "../../types/errors.js";

export interface RemoveCommandOptions {
  name?: string;
  all?: boolean;
  tag?: string;
  force?: boolean;
}

/**
 * Execute the remove command
 */
export async function executeRemove(options: RemoveCommandOptions): Promise<RemoveResult[]> {
  const registryService = new RegistryService();
  const processService = new ProcessService();
  const results: RemoveResult[] = [];

  try {
    await registryService.load();
    await processService.connect();

    let serversToRemove: ServerEntry[] = [];

    if (options.all) {
      serversToRemove = registryService.listServers();
    } else if (options.tag) {
      serversToRemove = registryService.listServers({ tag: options.tag });
    } else if (options.name) {
      const server = registryService.findByName(options.name);
      if (server) {
        serversToRemove = [server];
      } else {
        return [{
          name: options.name,
          success: false,
          message: `Server "${options.name}" not found in registry`,
        }];
      }
    }

    if (serversToRemove.length === 0) {
      return [];
    }

    // Ask for confirmation unless --force is specified
    if (!options.force) {
      // In CI mode, require --force to prevent hanging on confirmation prompt
      if (CIDetector.isCI()) {
        throw new ServherdError(
          ServherdErrorCode.INTERACTIVE_NOT_AVAILABLE,
          "Remove requires --force flag in CI mode to prevent hanging on confirmation prompt",
        );
      }

      const serverNames = serversToRemove.map((s) => s.name).join(", ");
      const message = serversToRemove.length === 1
        ? `Are you sure you want to remove server "${serversToRemove[0].name}"?`
        : `Are you sure you want to remove ${serversToRemove.length} servers (${serverNames})?`;

      const confirmed = await confirm({ message });

      if (!confirmed) {
        return serversToRemove.map((server) => ({
          name: server.name,
          success: false,
          cancelled: true,
          message: "Cancelled by user",
        }));
      }
    }

    for (const server of serversToRemove) {
      try {
        // First try to delete from PM2
        let pm2DeleteFailed = false;
        try {
          await processService.delete(server.pm2Name);
        } catch (error) {
          // If PM2 delete fails due to process not found, we still want to remove from registry
          const message = error instanceof Error ? error.message : String(error);
          if (!message.includes("not found") && !message.includes("process name not found")) {
            pm2DeleteFailed = true;
            results.push({
              name: server.name,
              success: false,
              message,
            });
            continue;
          }
          // Process not found in PM2 is okay - we'll still remove from registry
        }

        // Then remove from registry
        if (!pm2DeleteFailed) {
          await registryService.removeServer(server.id);
          results.push({
            name: server.name,
            success: true,
          });
        }
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
 * CLI action handler for remove command
 */
export async function removeAction(
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

    const results = await executeRemove({
      name,
      all: options.all,
      tag: options.tag,
      force: options.force,
    });

    if (options.json) {
      console.log(formatAsJson({ results }));
    } else {
      console.log(formatRemoveResult(results));
    }

    // Set exit code if any failures (excluding cancellations)
    if (results.some((r) => !r.success && !r.cancelled)) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (options.json) {
      console.log(formatErrorAsJson(error));
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
    }
    logger.error({ error }, "Remove command failed");
    process.exitCode = 1;
  }
}
