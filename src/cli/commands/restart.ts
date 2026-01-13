import { RegistryService } from "../../services/registry.service.js";
import { ProcessService } from "../../services/process.service.js";
import { ConfigService } from "../../services/config.service.js";
import type { ServerEntry, ServerStatus } from "../../types/registry.js";
import type { GlobalConfig } from "../../types/config.js";
import { formatRestartResult, formatError } from "../output/formatters.js";
import { formatAsJson, formatErrorAsJson } from "../output/json-formatter.js";
import { logger } from "../../utils/logger.js";
import { renderTemplate, renderEnvTemplates, getTemplateVariables } from "../../utils/template.js";
import {
  extractUsedConfigKeys,
  createConfigSnapshot,
  detectDrift,
} from "../../utils/config-drift.js";

export interface RestartCommandOptions {
  name?: string;
  all?: boolean;
  tag?: string;
}

export interface RestartResult {
  name: string;
  success: boolean;
  status?: ServerStatus;
  message?: string;
  configRefreshed?: boolean;
}

/**
 * Re-resolve a server's command template with current config values
 * Updates the registry with new resolved command and config snapshot
 */
async function refreshServerConfig(
  server: ServerEntry,
  config: GlobalConfig,
  registryService: RegistryService,
): Promise<{ resolvedCommand: string; configSnapshot: ReturnType<typeof createConfigSnapshot> }> {
  // Get template variables with current config
  const templateVars = getTemplateVariables(config, server.port);

  // Re-resolve the command template
  const resolvedCommand = renderTemplate(server.command, templateVars);

  // Re-resolve environment variables if any
  const resolvedEnv = server.env
    ? renderEnvTemplates(server.env, templateVars)
    : {};

  // Extract new used config keys and create new snapshot
  const usedConfigKeys = extractUsedConfigKeys(server.command);
  const configSnapshot = createConfigSnapshot(config, usedConfigKeys, server.command);

  // Update the registry
  await registryService.updateServer(server.id, {
    resolvedCommand,
    env: resolvedEnv,
    usedConfigKeys,
    configSnapshot,
  });

  return { resolvedCommand, configSnapshot };
}

/**
 * Execute the restart command for a single server
 */
export async function executeRestart(options: RestartCommandOptions): Promise<RestartResult | RestartResult[]> {
  const registryService = new RegistryService();
  const processService = new ProcessService();
  const configService = new ConfigService();

  try {
    // Load registry and config
    await registryService.load();
    const config = await configService.load();

    // Connect to PM2
    await processService.connect();

    // Determine which servers to restart
    let servers: ServerEntry[] = [];

    if (options.all) {
      servers = registryService.listServers();
    } else if (options.tag) {
      servers = registryService.listServers({ tag: options.tag });
    } else if (options.name) {
      const server = registryService.findByName(options.name);
      if (!server) {
        throw new Error(`Server "${options.name}" not found`);
      }
      servers = [server];
    } else {
      throw new Error("Either --name, --all, or --tag must be specified");
    }

    // Restart all matched servers
    const results: RestartResult[] = [];

    for (const server of servers) {
      try {
        let configRefreshed = false;

        // Check if we should refresh config on restart (on-start mode)
        if (config.refreshOnChange === "on-start") {
          const drift = detectDrift(server, config);
          if (drift.hasDrift) {
            // Re-resolve command with new config values
            const { resolvedCommand } = await refreshServerConfig(server, config, registryService);
            configRefreshed = true;

            // Delete old process and start with new command
            try {
              await processService.delete(server.pm2Name);
            } catch {
              // Process might not exist
            }

            // Parse the resolved command to extract script and args
            const parts = resolvedCommand.trim().split(/\s+/);
            const script = parts[0] || "node";
            const args = parts.slice(1);

            // Get the updated server entry for current env
            const updatedServer = registryService.findById(server.id);
            const env = updatedServer?.env ?? server.env;

            await processService.start({
              name: server.pm2Name,
              script,
              args,
              cwd: server.cwd,
              env: {
                ...env,
                PORT: String(server.port),
              },
            });
          } else {
            // No drift, just restart normally
            await processService.restart(server.pm2Name);
          }
        } else {
          // Not in on-start mode, just restart normally
          await processService.restart(server.pm2Name);
        }

        const status = await processService.getStatus(server.pm2Name);
        results.push({
          name: server.name,
          success: true,
          status,
          configRefreshed,
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

    // Return single result if single server was requested
    if (options.name && results.length === 1) {
      return results[0];
    }

    return results;
  } finally {
    processService.disconnect();
  }
}

/**
 * CLI action handler for restart command
 */
export async function restartAction(
  name: string | undefined,
  options: {
    all?: boolean;
    tag?: string;
    json?: boolean;
  },
): Promise<void> {
  try {
    if (!name && !options.all && !options.tag) {
      if (options.json) {
        console.log(formatErrorAsJson(new Error("Either server name, --all, or --tag must be specified")));
      } else {
        console.error(formatError("Either server name, --all, or --tag must be specified"));
      }
      process.exitCode = 1;
      return;
    }

    const result = await executeRestart({
      name,
      all: options.all,
      tag: options.tag,
    });

    const results = Array.isArray(result) ? result : [result];

    if (options.json) {
      console.log(formatAsJson({ results }));
    } else {
      console.log(formatRestartResult(results));
    }
  } catch (error) {
    if (options.json) {
      console.log(formatErrorAsJson(error));
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(formatError(message));
    }
    logger.error({ error }, "Restart command failed");
    process.exitCode = 1;
  }
}
