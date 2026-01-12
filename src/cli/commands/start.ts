import { input } from "@inquirer/prompts";
import { ConfigService } from "../../services/config.service.js";
import { RegistryService } from "../../services/registry.service.js";
import { PortService } from "../../services/port.service.js";
import { ProcessService } from "../../services/process.service.js";
import {
  renderTemplate,
  parseEnvStrings,
  renderEnvTemplates,
  findMissingVariables,
  getTemplateVariables,
  formatMissingVariablesError,
  type MissingVariable,
} from "../../utils/template.js";
import {
  extractUsedConfigKeys,
  createConfigSnapshot,
} from "../../utils/config-drift.js";
import type { GlobalConfig } from "../../types/config.js";
import type { ServerEntry, ServerStatus } from "../../types/registry.js";
import { formatStartResult } from "../output/formatters.js";
import { formatAsJson, formatErrorAsJson } from "../output/json-formatter.js";
import { logger } from "../../utils/logger.js";
import { ServherdError, ServherdErrorCode } from "../../types/errors.js";
import { CIDetector, type CIModeOptions } from "../../utils/ci-detector.js";

export interface StartCommandOptions {
  command: string;
  cwd?: string;
  name?: string;
  port?: number;
  protocol?: "http" | "https";
  tags?: string[];
  description?: string;
  env?: Record<string, string>;
}

export interface StartCommandResult {
  action: "started" | "existing" | "restarted" | "renamed";
  server: ServerEntry;
  status: ServerStatus;
  portReassigned?: boolean;
  originalPort?: number;
  previousName?: string;
}

/**
 * Execute the start command
 */
export async function executeStart(options: StartCommandOptions): Promise<StartCommandResult> {
  const configService = new ConfigService();
  const registryService = new RegistryService();
  const processService = new ProcessService();

  try {
    // Load config and registry
    const config = await configService.load();
    await registryService.load();

    // Connect to PM2
    await processService.connect();

    const cwd = options.cwd || process.cwd();

    // Check if server already exists
    const existingServer = registryService.findByCommandHash(cwd, options.command);

    if (existingServer) {
      // Check if user wants to rename the server
      const shouldRename = options.name && options.name !== existingServer.name;

      if (shouldRename) {
        // Rename the server
        const previousName = existingServer.name;
        const newName = options.name!;
        const newPm2Name = `servherd-${newName}`;

        // Delete the old PM2 process (if it exists)
        try {
          await processService.delete(existingServer.pm2Name);
        } catch {
          // Process might not exist in PM2, that's okay
        }

        // Update the registry with new name
        await registryService.updateServer(existingServer.id, {
          name: newName,
          pm2Name: newPm2Name,
        });

        const renamedServer: ServerEntry = {
          ...existingServer,
          name: newName,
          pm2Name: newPm2Name,
        };

        // Start the process with the new name
        await startProcess(processService, renamedServer);

        logger.info({ previousName, newName }, "Server renamed");

        return {
          action: "renamed",
          server: renamedServer,
          status: "online",
          previousName,
        };
      }

      // Server exists - check its status
      const status = await processService.getStatus(existingServer.pm2Name);

      if (status === "online") {
        // Already running
        return {
          action: "existing",
          server: existingServer,
          status: "online",
        };
      }

      // Stopped or errored - restart it
      try {
        await processService.restart(existingServer.pm2Name);
      } catch {
        // Process might not exist in PM2, start it fresh
        await startProcess(processService, existingServer);
      }

      return {
        action: "restarted",
        server: existingServer,
        status: "online",
      };
    }

    // New server - register and start
    const portService = new PortService(config);

    // Assign port with availability checking
    const { port, reassigned: portReassigned } = await portService.assignPort(
      cwd,
      options.command,
      options.port,
    );

    // Track original port for reporting if reassigned
    const originalPort = portReassigned
      ? (options.port ?? portService.generatePort(cwd, options.command))
      : undefined;

    const hostname = config.hostname;
    const protocol = options.protocol ?? config.protocol;
    const url = `${protocol}://${hostname}:${port}`;

    // Template variables for substitution (includes HTTPS cert/key paths)
    const templateVars = {
      port,
      hostname,
      url,
      "https-cert": config.httpsCert ?? "",
      "https-key": config.httpsKey ?? "",
    };

    // Resolve template variables in command
    const resolvedCommand = renderTemplate(options.command, templateVars);

    // Resolve template variables in environment values
    const resolvedEnv = options.env
      ? renderEnvTemplates(options.env, templateVars)
      : undefined;

    // Extract used config keys and create snapshot for drift detection
    const usedConfigKeys = extractUsedConfigKeys(options.command);
    const configSnapshot = createConfigSnapshot(config, usedConfigKeys);

    // Register server
    const server = await registryService.addServer({
      command: options.command,
      cwd,
      port,
      name: options.name,
      protocol,
      hostname,
      tags: options.tags,
      description: options.description,
      env: resolvedEnv,
      usedConfigKeys,
      configSnapshot,
    });

    // Update with resolved command
    await registryService.updateServer(server.id, {
      resolvedCommand,
    });

    // Start the process
    await startProcess(processService, {
      ...server,
      resolvedCommand,
    });

    return {
      action: "started",
      server: {
        ...server,
        resolvedCommand,
      },
      status: "online",
      portReassigned,
      originalPort,
    };
  } finally {
    processService.disconnect();
  }
}

/**
 * Start a process using PM2
 */
async function startProcess(processService: ProcessService, server: ServerEntry): Promise<void> {
  // Parse the resolved command to extract script and args
  const parts = parseCommand(server.resolvedCommand);

  await processService.start({
    name: server.pm2Name,
    script: parts.script,
    args: parts.args,
    cwd: server.cwd,
    env: {
      ...server.env,
      PORT: String(server.port),
    },
  });
}

/**
 * Parse a command string into script and args
 */
function parseCommand(command: string): { script: string; args: string[] } {
  const parts = command.trim().split(/\s+/);
  const script = parts[0] || "node";
  const args = parts.slice(1);
  return { script, args };
}

/**
 * Prompt user for missing template variables and update config
 * @param missing - Array of missing variables
 * @param configService - Config service instance
 * @param config - Current config
 * @returns Updated config with new values
 */
async function promptForMissingVariables(
  missing: MissingVariable[],
  configService: ConfigService,
  config: GlobalConfig,
): Promise<GlobalConfig> {
  const configurableMissing = missing.filter(v => v.configurable);

  if (configurableMissing.length === 0) {
    return config;
  }

  console.log("\nThe following template variables need to be configured:\n");

  const updatedConfig = { ...config };

  for (const v of configurableMissing) {
    const value = await input({
      message: v.prompt,
    });

    // Update config with the new value
    if (v.configKey) {
      // Handle nested config keys if needed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (updatedConfig as any)[v.configKey] = value;
    }
  }

  // Save the updated config for future use
  await configService.save(updatedConfig);
  console.log("\n✓ Configuration saved for future use\n");

  return updatedConfig;
}

/**
 * CLI action handler for start command
 */
export async function startAction(
  commandArgs: string[],
  options: {
    name?: string;
    port?: number;
    protocol?: "http" | "https";
    tag?: string[];
    description?: string;
    env?: string[];
    json?: boolean;
    ci?: boolean;
    noCi?: boolean;
  },
): Promise<void> {
  try {
    const command = commandArgs.join(" ");

    if (!command) {
      const error = new ServherdError(
        ServherdErrorCode.COMMAND_MISSING_ARGUMENT,
        "Command is required",
      );
      if (options.json) {
        console.log(formatErrorAsJson(error));
      } else {
        console.error("Error: Command is required");
      }
      process.exitCode = 1;
      return;
    }

    // Check for missing template variables before starting
    const configService = new ConfigService();
    let config = await configService.load();

    // Use placeholder port to check config-based variables
    const templateVars = getTemplateVariables(config, 0);
    const missingVars = findMissingVariables(command, templateVars);
    const configurableMissing = missingVars.filter(v => v.configurable);

    // Check CI mode options
    const ciModeOptions: CIModeOptions = {
      ci: options.ci,
      noCi: options.noCi,
    };
    const isCI = CIDetector.isCI(ciModeOptions);

    if (configurableMissing.length > 0) {
      if (isCI) {
        // In CI mode, show error and exit
        const errorMessage = formatMissingVariablesError(configurableMissing);
        if (options.json) {
          console.log(formatErrorAsJson(new ServherdError(
            ServherdErrorCode.CONFIG_VALIDATION_FAILED,
            errorMessage,
          )));
        } else {
          console.error(`Error: ${errorMessage}`);
        }
        process.exitCode = 1;
        return;
      }

      // In interactive mode, prompt for missing values
      config = await promptForMissingVariables(configurableMissing, configService, config);
    }

    // Parse environment variables from KEY=VALUE format
    let env: Record<string, string> | undefined;
    if (options.env && options.env.length > 0) {
      env = parseEnvStrings(options.env);
    }

    const result = await executeStart({
      command,
      cwd: process.cwd(),
      name: options.name,
      port: options.port,
      protocol: options.protocol,
      tags: options.tag,
      description: options.description,
      env,
    });

    // Warn about port reassignment (unless in JSON mode)
    if (result.portReassigned && !options.json) {
      console.warn(
        `\x1b[33m⚠ Port ${result.originalPort} unavailable, reassigned to ${result.server.port}\x1b[0m`,
      );
    }

    if (options.json) {
      console.log(formatAsJson(result));
    } else {
      console.log(formatStartResult(result));
    }
  } catch (error) {
    if (options.json) {
      console.log(formatErrorAsJson(error));
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
    }
    logger.error({ error }, "Start command failed");
    process.exitCode = 1;
  }
}
