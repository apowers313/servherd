import { input, confirm } from "@inquirer/prompts";
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
  type TemplateVariables,
  type TemplateContext,
} from "../../utils/template.js";
import {
  extractUsedConfigKeys,
  createConfigSnapshot,
  detectDrift,
  formatDrift,
  type DriftResult,
} from "../../utils/config-drift.js";
import { hasEnvChanged } from "../../utils/env-compare.js";
import { generateDeterministicName } from "../../utils/names.js";
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
  action: "started" | "existing" | "restarted" | "renamed" | "refreshed";
  server: ServerEntry;
  status: ServerStatus;
  portReassigned?: boolean;
  originalPort?: number;
  previousName?: string;
  envChanged?: boolean;
  /** Whether the command was changed (with explicit -n) */
  commandChanged?: boolean;
  /** Whether config drift was detected and applied */
  configDrift?: boolean;
  /** Details of config drift that was applied */
  driftDetails?: string[];
  /** User declined refresh when prompted */
  userDeclinedRefresh?: boolean;
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

    // Build template context for server lookups
    const templateContext = buildTemplateContext(registryService, cwd);

    // Determine server name for identity lookup
    // New identity model: server identity = cwd + name
    let serverName: string;
    let isExplicitName = false;

    if (options.name) {
      // User provided explicit name - identity is cwd + provided name
      serverName = options.name;
      isExplicitName = true;
    } else {
      // Generate deterministic name from command + env (UNRESOLVED values)
      serverName = generateDeterministicName(options.command, options.env);
    }

    // Primary lookup: cwd + name (new identity model)
    let existingServer = registryService.findByCwdAndName(cwd, serverName);

    // Fallback for backward compatibility with legacy servers
    // Legacy servers may have been created with random names, matched by command hash
    if (!existingServer && !isExplicitName) {
      existingServer = registryService.findByCommandHash(cwd, options.command);
    }

    if (existingServer) {
      // Check if command has changed (only relevant with explicit -n)
      const commandChanged = isExplicitName && existingServer.command !== options.command;

      // Check for config drift before checking status
      const drift = detectDrift(existingServer, config);

      if (drift.hasDrift) {
        const refreshOnChange = config.refreshOnChange ?? "on-start";

        if (refreshOnChange === "prompt") {
          // Ask user
          console.log("\n" + formatDrift(drift));
          const shouldRefresh = await confirm({
            message: "Configuration has changed. Refresh server with new settings?",
            default: true,
          });

          if (shouldRefresh) {
            return await handleDriftRefresh(
              existingServer, config, drift, processService, registryService, options, templateContext, commandChanged,
            );
          }
          // User declined - continue with normal flow but mark it
        } else if (refreshOnChange === "on-start" || refreshOnChange === "auto") {
          // Auto-refresh
          return await handleDriftRefresh(
            existingServer, config, drift, processService, registryService, options, templateContext, commandChanged,
          );
        }
        // refreshOnChange === "manual" - don't auto-refresh, continue with normal flow
      }

      // Server exists - check its status
      const status = await processService.getStatus(existingServer.pm2Name);

      // Check if environment variables have changed
      const templateVars = buildTemplateVars(config, existingServer.port, existingServer.hostname, existingServer.protocol);
      const resolvedEnv = options.env
        ? renderEnvTemplates(options.env, templateVars, templateContext)
        : undefined;
      const envChanged = hasEnvChanged(existingServer.env, resolvedEnv);

      if (status === "online" && !envChanged && !commandChanged) {
        // Already running with same config
        return {
          action: "existing",
          server: existingServer,
          status: "online",
          userDeclinedRefresh: drift.hasDrift, // If we got here with drift, user declined
        };
      }

      // Command changed, env changed, or server stopped/errored - need to restart
      if (commandChanged || envChanged) {
        // Build template vars for re-resolving command
        const newTemplateVars = {
          ...(config.variables ?? {}),
          port: existingServer.port,
          hostname: existingServer.hostname,
          url: `${existingServer.protocol}://${existingServer.hostname}:${existingServer.port}`,
          "https-cert": config.httpsCert ?? "",
          "https-key": config.httpsKey ?? "",
        };

        // Re-resolve command if it changed
        const newCommand = commandChanged ? options.command : existingServer.command;
        const newResolvedCommand = renderTemplate(newCommand, newTemplateVars, templateContext);

        // Re-extract used config keys and create snapshot
        const usedConfigKeys = extractUsedConfigKeys(newCommand);
        const configSnapshot = createConfigSnapshot(config, usedConfigKeys, newCommand);

        // Update the registry (undefined env means "clear env", use empty object)
        await registryService.updateServer(existingServer.id, {
          command: newCommand,
          resolvedCommand: newResolvedCommand,
          env: resolvedEnv ?? {},
          usedConfigKeys,
          configSnapshot,
        });

        // Delete the old PM2 process to ensure fresh start
        try {
          await processService.delete(existingServer.pm2Name);
        } catch {
          // Process might not exist in PM2, that's okay
        }

        const updatedServer: ServerEntry = {
          ...existingServer,
          command: newCommand,
          resolvedCommand: newResolvedCommand,
          env: resolvedEnv ?? {},
          usedConfigKeys,
          configSnapshot,
        };

        // Start with new config
        await startProcess(processService, updatedServer);

        if (commandChanged) {
          logger.info({ serverName: existingServer.name }, "Server restarted due to command change");
        } else {
          logger.info({ serverName: existingServer.name }, "Server restarted due to environment change");
        }

        return {
          action: "restarted",
          server: updatedServer,
          status: "online",
          envChanged,
          commandChanged,
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

    // Template variables for substitution (includes HTTPS cert/key paths and custom vars)
    const templateVars = {
      ...(config.variables ?? {}), // Custom variables first
      port,
      hostname,
      url,
      "https-cert": config.httpsCert ?? "",
      "https-key": config.httpsKey ?? "",
    };

    // Resolve template variables in command
    const resolvedCommand = renderTemplate(options.command, templateVars, templateContext);

    // Resolve template variables in environment values
    const resolvedEnv = options.env
      ? renderEnvTemplates(options.env, templateVars, templateContext)
      : undefined;

    // Extract used config keys and create snapshot for drift detection
    const usedConfigKeys = extractUsedConfigKeys(options.command);
    const configSnapshot = createConfigSnapshot(config, usedConfigKeys, options.command);

    // Register server with the determined name (explicit or deterministic)
    const server = await registryService.addServer({
      command: options.command,
      cwd,
      port,
      name: serverName,
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
 * Handle refreshing a server due to config drift
 */
async function handleDriftRefresh(
  server: ServerEntry,
  config: GlobalConfig,
  drift: DriftResult,
  processService: ProcessService,
  registryService: RegistryService,
  options: StartCommandOptions,
  templateContext: TemplateContext,
  commandChanged = false,
): Promise<StartCommandResult> {
  const portService = new PortService(config);

  // Use new command if it changed (with explicit -n), otherwise keep existing
  const newCommand = commandChanged ? options.command : server.command;

  let newPort = server.port;
  let portReassigned = false;
  let originalPort: number | undefined;

  // Handle port out of range - use deterministic port assignment
  if (drift.portOutOfRange) {
    originalPort = server.port;
    const { port, reassigned } = await portService.assignPort(
      server.cwd,
      newCommand,
      undefined, // No explicit port - use deterministic logic
    );
    newPort = port;
    portReassigned = reassigned || (port !== server.port);
  }

  // Get new config values
  const hostname = config.hostname;
  const protocol = options.protocol ?? config.protocol;
  const url = `${protocol}://${hostname}:${newPort}`;

  // Build template variables with new config (including custom variables)
  const templateVars = {
    ...(config.variables ?? {}), // Custom variables first
    port: newPort,
    hostname,
    url,
    "https-cert": config.httpsCert ?? "",
    "https-key": config.httpsKey ?? "",
  };

  // Re-render command with new values
  const resolvedCommand = renderTemplate(newCommand, templateVars, templateContext);

  // Re-resolve environment variables
  const resolvedEnv = options.env
    ? renderEnvTemplates(options.env, templateVars, templateContext)
    : server.env;

  // Re-extract used config keys and create new snapshot
  const usedConfigKeys = extractUsedConfigKeys(newCommand);
  const configSnapshot = createConfigSnapshot(config, usedConfigKeys, newCommand);

  // Update registry
  await registryService.updateServer(server.id, {
    command: newCommand,
    port: newPort,
    protocol,
    hostname,
    resolvedCommand,
    env: resolvedEnv,
    usedConfigKeys,
    configSnapshot,
  });

  // Delete old PM2 process and start fresh
  try {
    await processService.delete(server.pm2Name);
  } catch {
    // Process might not exist
  }

  const updatedServer: ServerEntry = {
    ...server,
    command: newCommand,
    port: newPort,
    protocol,
    hostname,
    resolvedCommand,
    env: resolvedEnv,
    usedConfigKeys,
    configSnapshot,
  };

  await startProcess(processService, updatedServer);

  logger.info(
    { serverName: server.name, driftedKeys: drift.driftedValues.map(d => d.configKey) },
    "Server refreshed due to config drift",
  );

  return {
    action: "refreshed",
    server: updatedServer,
    status: "online",
    configDrift: true,
    commandChanged,
    driftDetails: drift.driftedValues.map(d => {
      const from = d.startedWith ?? "(not set)";
      const to = d.currentValue ?? "(not set)";
      return `${d.configKey}: "${from}" → "${to}"`;
    }),
    portReassigned,
    originalPort,
  };
}

/**
 * Build template variables from config and server details
 */
function buildTemplateVars(
  config: GlobalConfig,
  port: number,
  hostname: string,
  protocol: string,
): TemplateVariables {
  const url = `${protocol}://${hostname}:${port}`;
  return {
    port,
    hostname,
    url,
    "https-cert": config.httpsCert ?? "",
    "https-key": config.httpsKey ?? "",
  };
}

/**
 * Build template context for server lookups
 * @param registryService - Registry service instance for looking up servers
 * @param cwd - Current working directory for scoping server lookups
 */
function buildTemplateContext(
  registryService: RegistryService,
  cwd: string,
): TemplateContext {
  return {
    cwd,
    lookupServer: (name: string, lookupCwd?: string) => {
      return registryService.findByCwdAndName(lookupCwd ?? cwd, name);
    },
  };
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
