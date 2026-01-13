import { RegistryService } from "../../services/registry.service.js";
import { ProcessService } from "../../services/process.service.js";
import { ConfigService } from "../../services/config.service.js";
import { PortService } from "../../services/port.service.js";
import type { ServerEntry, ServerStatus } from "../../types/registry.js";
import type { GlobalConfig } from "../../types/config.js";
import { renderTemplate, renderEnvTemplates, getTemplateVariables } from "../../utils/template.js";
import {
  extractUsedConfigKeys,
  createConfigSnapshot,
  findServersWithDrift,
  formatDrift,
} from "../../utils/config-drift.js";

export interface RefreshCommandOptions {
  name?: string;
  all?: boolean;
  tag?: string;
  dryRun?: boolean;
}

export interface RefreshResult {
  name: string;
  success: boolean;
  status?: ServerStatus;
  message?: string;
  driftDetails?: string;
  skipped?: boolean;
  /** Whether port was reassigned due to being out of range */
  portReassigned?: boolean;
  /** Original port before reassignment */
  originalPort?: number;
  /** New port after reassignment */
  newPort?: number;
}

/**
 * Re-resolve a server's command template with current config values
 * Updates the registry with new resolved command and config snapshot
 * @param newPort - Optional new port if port was reassigned
 */
async function refreshServerConfig(
  server: ServerEntry,
  config: GlobalConfig,
  registryService: RegistryService,
  newPort?: number,
): Promise<{ resolvedCommand: string; port: number }> {
  const port = newPort ?? server.port;

  // Get template variables with current config
  const templateVars = getTemplateVariables(config, port);

  // Re-resolve the command template
  const resolvedCommand = renderTemplate(server.command, templateVars);

  // Re-resolve environment variables if any
  const resolvedEnv = server.env
    ? renderEnvTemplates(server.env, templateVars)
    : {};

  // Extract new used config keys and create new snapshot
  const usedConfigKeys = extractUsedConfigKeys(server.command);
  const configSnapshot = createConfigSnapshot(config, usedConfigKeys, server.command);

  // Update the registry (include port if it changed)
  const updates: Record<string, unknown> = {
    resolvedCommand,
    env: resolvedEnv,
    usedConfigKeys,
    configSnapshot,
  };
  if (newPort !== undefined) {
    updates.port = newPort;
  }

  await registryService.updateServer(server.id, updates);

  return { resolvedCommand, port };
}

/**
 * Execute the refresh command
 * Finds servers with config drift and restarts them with updated config
 */
export async function executeRefresh(options: RefreshCommandOptions): Promise<RefreshResult[]> {
  const registryService = new RegistryService();
  const processService = new ProcessService();
  const configService = new ConfigService();

  try {
    // Load registry and config
    await registryService.load();
    const config = await configService.load();

    // Connect to PM2
    await processService.connect();

    // Determine which servers to check
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
      // Default: find all servers with drift
      servers = registryService.listServers();
    }

    // Find servers with drift
    const serversWithDrift = findServersWithDrift(servers, config);

    // If no drift, return early
    if (serversWithDrift.length === 0) {
      return [{
        name: "",
        success: true,
        skipped: true,
        message: "No servers have config drift",
      }];
    }

    const results: RefreshResult[] = [];
    const portService = new PortService(config);

    for (const { server, drift } of serversWithDrift) {
      const driftDetails = formatDrift(drift);

      // Check if port needs reassignment
      let newPort: number | undefined;
      let portReassigned = false;
      if (drift.portOutOfRange) {
        const { port } = await portService.assignPort(
          server.cwd,
          server.command,
          undefined, // Use deterministic logic
        );
        newPort = port;
        portReassigned = true;
      }

      // Dry run mode - just report what would happen
      if (options.dryRun) {
        const dryRunResult: RefreshResult = {
          name: server.name,
          success: true,
          skipped: true,
          message: "Would refresh (dry-run mode)",
          driftDetails,
        };
        if (portReassigned) {
          dryRunResult.portReassigned = true;
          dryRunResult.originalPort = server.port;
          dryRunResult.newPort = newPort;
          dryRunResult.message = `Would refresh and reassign port ${server.port} → ${newPort} (dry-run mode)`;
        }
        results.push(dryRunResult);
        continue;
      }

      try {
        // Re-resolve command with new config values (and new port if reassigned)
        const { resolvedCommand, port } = await refreshServerConfig(server, config, registryService, newPort);

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
            PORT: String(port),
          },
        });

        const status = await processService.getStatus(server.pm2Name);
        const result: RefreshResult = {
          name: server.name,
          success: true,
          status,
          driftDetails,
        };
        if (portReassigned) {
          result.portReassigned = true;
          result.originalPort = server.port;
          result.newPort = newPort;
        }
        results.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          name: server.name,
          success: false,
          message,
          driftDetails,
        });
      }
    }

    return results;
  } finally {
    processService.disconnect();
  }
}
