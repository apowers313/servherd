import { confirm, input, select } from "@inquirer/prompts";
import { pathExists } from "fs-extra/esm";
import { ConfigService } from "../../services/config.service.js";
import { RegistryService } from "../../services/registry.service.js";
import type { GlobalConfig } from "../../types/config.js";
import { formatConfigResult, type ConfigResult } from "../output/formatters.js";
import { formatAsJson, formatErrorAsJson } from "../output/json-formatter.js";
import { logger } from "../../utils/logger.js";
import { CIDetector } from "../../utils/ci-detector.js";
import { ServherdError, ServherdErrorCode } from "../../types/errors.js";
import { findServersUsingConfigKey } from "../../utils/config-drift.js";
import { executeRefresh } from "./refresh.js";

export interface ConfigCommandOptions {
  show?: boolean;
  get?: string;
  set?: string;
  value?: string;
  reset?: boolean;
  force?: boolean;
  refresh?: string;
  refreshAll?: boolean;
  tag?: string;
  dryRun?: boolean;
  add?: string;
  remove?: string;
  listVars?: boolean;
}

// Valid top-level config keys
const VALID_TOP_LEVEL_KEYS = ["version", "hostname", "protocol", "portRange", "tempDir", "pm2", "httpsCert", "httpsKey", "refreshOnChange", "variables"];
const VALID_NESTED_KEYS = ["portRange.min", "portRange.max", "pm2.logDir", "pm2.pidDir"];

// Config keys that can affect server commands (used for drift detection)
const SERVER_AFFECTING_KEYS = ["hostname", "httpsCert", "httpsKey"];

// Reserved variable names that cannot be used for custom variables
const RESERVED_VARIABLE_NAMES = ["port", "hostname", "url", "https-cert", "https-key"];

// Regex pattern for valid variable names (must match template regex)
const VARIABLE_NAME_PATTERN = /^[\w-]+$/;

function isValidKey(key: string): boolean {
  return VALID_TOP_LEVEL_KEYS.includes(key) || VALID_NESTED_KEYS.includes(key);
}

function getNestedValue(config: GlobalConfig, key: string): unknown {
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = config;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function setNestedValue(config: GlobalConfig, key: string, value: unknown): GlobalConfig {
  const parts = key.split(".");
  const result = { ...config };

  if (parts.length === 1) {
    // Top-level key
    (result as Record<string, unknown>)[key] = value;
  } else if (parts.length === 2) {
    // Nested key (e.g., portRange.min)
    const [parentKey, childKey] = parts;
    if (parentKey === "portRange") {
      result.portRange = { ...result.portRange, [childKey]: value };
    } else if (parentKey === "pm2") {
      result.pm2 = { ...result.pm2, [childKey]: value };
    }
  }

  return result;
}

/**
 * Handle server refresh after a config change based on refreshOnChange setting
 */
async function handleConfigChangeRefresh(
  config: GlobalConfig,
  changedKey: string,
): Promise<{ refreshed: boolean; message?: string }> {
  // Only handle server-affecting keys
  if (!SERVER_AFFECTING_KEYS.includes(changedKey)) {
    return { refreshed: false };
  }

  const refreshOnChange = config.refreshOnChange ?? "on-start";

  // manual and on-start modes don't auto-refresh
  if (refreshOnChange === "manual" || refreshOnChange === "on-start") {
    return { refreshed: false };
  }

  // Find servers that use this config key
  const registryService = new RegistryService();
  await registryService.load();
  const allServers = registryService.listServers();
  const affectedServers = findServersUsingConfigKey(allServers, changedKey);

  if (affectedServers.length === 0) {
    return { refreshed: false };
  }

  const serverNames = affectedServers.map(s => s.name).join(", ");

  if (refreshOnChange === "prompt") {
    // Don't prompt in CI mode
    if (CIDetector.isCI()) {
      return {
        refreshed: false,
        message: `${affectedServers.length} server(s) use this config value. Run "servherd refresh" to apply changes.`,
      };
    }

    // Prompt user
    const shouldRefresh = await confirm({
      message: `${affectedServers.length} server(s) use this config value (${serverNames}). Restart them now?`,
    });

    if (!shouldRefresh) {
      return {
        refreshed: false,
        message: "Run \"servherd refresh\" later to apply changes to affected servers.",
      };
    }
  }

  // Execute refresh for all servers (will filter to those with drift)
  try {
    await executeRefresh({ all: true });
    return {
      refreshed: true,
      message: `Refreshed ${affectedServers.length} server(s): ${serverNames}`,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      refreshed: false,
      message: `Failed to refresh servers: ${errorMsg}`,
    };
  }
}

/**
 * Execute the config command
 */
export async function executeConfig(options: ConfigCommandOptions): Promise<ConfigResult> {
  const configService = new ConfigService();

  // Load current config
  await configService.load();

  // Handle --refresh or --refresh-all
  if (options.refresh || options.refreshAll) {
    const refreshResults = await executeRefresh({
      name: options.refresh,
      all: options.refreshAll,
      tag: options.tag,
      dryRun: options.dryRun,
    });

    return {
      refreshResults,
      dryRun: options.dryRun,
    };
  }

  // Handle --list-vars
  if (options.listVars) {
    const config = await configService.load();
    return {
      variables: config.variables ?? {},
    };
  }

  // Handle --add
  if (options.add) {
    const name = options.add;

    if (options.value === undefined) {
      return {
        addedVar: false,
        error: "--value is required when using --add",
      };
    }

    // Validate variable name format
    if (!VARIABLE_NAME_PATTERN.test(name)) {
      return {
        addedVar: false,
        error: `Invalid variable name "${name}". Variable names can only contain letters, numbers, underscores, and hyphens.`,
      };
    }

    // Check for reserved names
    if (RESERVED_VARIABLE_NAMES.includes(name)) {
      return {
        addedVar: false,
        error: `"${name}" is a reserved variable name. Reserved names: ${RESERVED_VARIABLE_NAMES.join(", ")}`,
      };
    }

    const config = await configService.load();
    const updatedConfig: GlobalConfig = {
      ...config,
      variables: {
        ...(config.variables ?? {}),
        [name]: options.value,
      },
    };
    await configService.save(updatedConfig);

    return {
      addedVar: true,
      varName: name,
      varValue: options.value,
    };
  }

  // Handle --remove
  if (options.remove) {
    const name = options.remove;
    const config = await configService.load();

    if (!config.variables || !(name in config.variables)) {
      return {
        removedVar: false,
        error: `Variable "${name}" does not exist`,
      };
    }

    const updatedVariables = { ...config.variables };
    delete updatedVariables[name];
    const updatedConfig: GlobalConfig = {
      ...config,
      variables: updatedVariables,
    };
    await configService.save(updatedConfig);

    return {
      removedVar: true,
      varName: name,
    };
  }

  // Handle --get
  if (options.get) {
    const key = options.get;

    if (!isValidKey(key)) {
      return {
        error: `Unknown configuration key: "${key}"`,
      };
    }

    const config = await configService.load();
    const value = getNestedValue(config, key);

    return {
      key,
      value,
    };
  }

  // Handle --set
  if (options.set) {
    const key = options.set;

    if (options.value === undefined) {
      return {
        updated: false,
        error: "--value is required when using --set",
      };
    }

    if (!isValidKey(key)) {
      return {
        updated: false,
        error: `Unknown configuration key: "${key}"`,
      };
    }

    // Validate and convert value based on key
    let parsedValue: unknown = options.value;

    if (key === "protocol") {
      if (options.value !== "http" && options.value !== "https") {
        return {
          updated: false,
          error: "Invalid protocol value. Must be \"http\" or \"https\"",
        };
      }
    } else if (key === "refreshOnChange") {
      const validModes = ["manual", "prompt", "auto", "on-start"];
      if (!validModes.includes(options.value)) {
        return {
          updated: false,
          error: `Invalid refreshOnChange value. Must be one of: ${validModes.join(", ")}`,
        };
      }
    } else if (key === "portRange.min" || key === "portRange.max") {
      const num = parseInt(options.value, 10);
      if (isNaN(num)) {
        return {
          updated: false,
          error: "Invalid port value. Must be a number",
        };
      }
      if (num < 1 || num > 65535) {
        return {
          updated: false,
          error: "Invalid port value. Must be between 1 and 65535",
        };
      }
      parsedValue = num;
    }

    // Validate HTTPS certificate/key paths exist
    if ((key === "httpsCert" || key === "httpsKey") && options.value && options.value.length > 0) {
      const fileExists = await pathExists(options.value);
      if (!fileExists) {
        return {
          updated: false,
          error: `File not found: ${options.value}`,
        };
      }
    }

    // Handle nested keys vs top-level keys
    let updatedConfig: GlobalConfig;
    if (key.includes(".")) {
      const config = await configService.load();
      updatedConfig = setNestedValue(config, key, parsedValue);
      await configService.save(updatedConfig);
    } else {
      await configService.set(key as keyof GlobalConfig, parsedValue as GlobalConfig[keyof GlobalConfig]);
      updatedConfig = await configService.load();
    }

    // Handle refresh behavior after config change
    const refreshResult = await handleConfigChangeRefresh(updatedConfig, key);

    return {
      updated: true,
      key,
      value: parsedValue,
      refreshMessage: refreshResult.message,
    };
  }

  // Handle --reset
  if (options.reset) {
    if (!options.force) {
      const confirmed = await confirm({
        message: "Are you sure you want to reset configuration to defaults?",
      });

      if (!confirmed) {
        return {
          reset: false,
          cancelled: true,
        };
      }
    }

    const defaults = configService.getDefaults();
    await configService.save(defaults);

    return {
      reset: true,
      config: defaults,
    };
  }

  // Handle --show (default)
  const config = await configService.load();
  const configPath = configService.getLoadedConfigPath();
  const globalConfigPath = configService.getConfigPath();

  return {
    config,
    configPath,
    globalConfigPath,
  };
}

/**
 * Run the interactive configuration wizard
 * Prompts the user for all configuration values interactively
 * @throws ServherdError if running in CI mode
 */
export async function runConfigWizard(): Promise<void> {
  if (CIDetector.isCI()) {
    throw new ServherdError(
      ServherdErrorCode.INTERACTIVE_NOT_AVAILABLE,
      "Interactive config not available in CI mode. Use \"servherd config --set <key> --value <value>\"",
    );
  }

  const configService = new ConfigService();
  await configService.load();
  const currentConfig = await configService.load();

  // Prompt for hostname
  const hostname = await input({
    message: "Default hostname:",
    default: currentConfig.hostname,
  });

  // Prompt for protocol
  const protocol = await select({
    message: "Default protocol:",
    choices: [
      { name: "HTTP", value: "http" },
      { name: "HTTPS", value: "https" },
    ],
    default: currentConfig.protocol,
  }) as "http" | "https";

  // If HTTPS, prompt for cert and key paths
  let httpsCert: string | undefined;
  let httpsKey: string | undefined;

  if (protocol === "https") {
    httpsCert = await input({
      message: "Path to HTTPS certificate:",
      default: currentConfig.httpsCert,
    });
    httpsKey = await input({
      message: "Path to HTTPS key:",
      default: currentConfig.httpsKey,
    });
  }

  // Prompt for port range
  const portMinStr = await input({
    message: "Minimum port:",
    default: String(currentConfig.portRange.min),
    validate: (v) => !isNaN(parseInt(v)) || "Must be a number",
  });

  const portMaxStr = await input({
    message: "Maximum port:",
    default: String(currentConfig.portRange.max),
    validate: (v) => !isNaN(parseInt(v)) || "Must be a number",
  });

  // Save the configuration
  const newConfig: GlobalConfig = {
    ...currentConfig,
    hostname,
    protocol,
    httpsCert,
    httpsKey,
    portRange: {
      min: parseInt(portMinStr, 10),
      max: parseInt(portMaxStr, 10),
    },
  };

  await configService.save(newConfig);
  console.log("✓ Configuration saved");
}

/**
 * CLI action handler for config command
 */
export async function configAction(options: {
  show?: boolean;
  get?: string;
  set?: string;
  value?: string;
  reset?: boolean;
  force?: boolean;
  json?: boolean;
  add?: string;
  remove?: string;
  listVars?: boolean;
  refresh?: string;
  refreshAll?: boolean;
  tag?: string;
  dryRun?: boolean;
}): Promise<void> {
  try {
    // Check if any explicit option was provided
    const hasOptions = options.show || options.get || options.set ||
                       options.reset || options.refresh || options.refreshAll ||
                       options.add || options.remove || options.listVars;

    // If no options provided, run wizard in interactive mode, or show config in CI mode
    if (!hasOptions) {
      if (CIDetector.isCI()) {
        // In CI, default to showing config (no interactive wizard)
        const result = await executeConfig({ show: true });
        if (options.json) {
          console.log(formatAsJson(result));
        } else {
          console.log(formatConfigResult(result));
        }
        return;
      } else {
        // In interactive mode, run the wizard
        await runConfigWizard();
        return;
      }
    }

    const result = await executeConfig(options);

    if (options.json) {
      console.log(formatAsJson(result));
    } else {
      console.log(formatConfigResult(result));
    }

    if (result.error) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (options.json) {
      console.log(formatErrorAsJson(error));
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
    }
    logger.error({ error }, "Config command failed");
    process.exitCode = 1;
  }
}
