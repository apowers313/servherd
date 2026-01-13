/**
 * Utilities for detecting configuration drift in servers.
 * Drift occurs when config values have changed since a server was started.
 */

import type { GlobalConfig } from "../types/config.js";
import type { ServerEntry, ConfigSnapshot } from "../types/registry.js";
import { extractVariables, TEMPLATE_VAR_TO_CONFIG_KEY, usesUrlVariable } from "./template.js";

/**
 * Information about a drifted config value
 */
export interface DriftedValue {
  /** The config key that has drifted */
  configKey: string;
  /** The template variable name */
  templateVar: string;
  /** The value when server was started */
  startedWith: string | undefined;
  /** The current config value */
  currentValue: string | undefined;
}

/**
 * Result of drift detection for a server
 */
export interface DriftResult {
  /** Whether the server has config drift */
  hasDrift: boolean;
  /** List of drifted values */
  driftedValues: DriftedValue[];
  /** Whether the server's port is outside the current port range */
  portOutOfRange?: boolean;
  /** Whether the protocol has changed (affects servers using {{url}}) */
  protocolChanged?: boolean;
}

/**
 * Extract the config keys used by a command template
 * @param command - The command template string
 * @returns Array of config keys used (e.g., ["hostname", "httpsCert", "portRange"])
 */
export function extractUsedConfigKeys(command: string): string[] {
  const templateVars = extractVariables(command);
  const configKeys: string[] = [];

  // Explicit template variable dependencies
  for (const varName of templateVars) {
    const configKey = TEMPLATE_VAR_TO_CONFIG_KEY[varName];
    if (configKey) {
      configKeys.push(configKey);
    }
  }

  // Implicit dependencies - all servers depend on portRange
  configKeys.push("portRange");

  // Servers using {{url}} implicitly depend on protocol
  if (usesUrlVariable(command)) {
    configKeys.push("protocol");
  }

  return [...new Set(configKeys)]; // Deduplicate
}

/**
 * Extract custom variable names used in a command template
 * @param command - The command template string
 * @param config - Current global config (to identify which vars are custom)
 * @returns Array of custom variable names used
 */
export function extractUsedCustomVariables(
  command: string,
  config: GlobalConfig,
): string[] {
  const templateVars = extractVariables(command);
  const customVarNames = Object.keys(config.variables ?? {});

  return templateVars.filter(v => customVarNames.includes(v));
}

/**
 * Create a config snapshot containing only the values used by a server
 * @param config - Current global config
 * @param usedConfigKeys - Config keys used by the server
 * @param command - The command template (needed for custom variable extraction)
 * @returns Config snapshot with only relevant values
 */
export function createConfigSnapshot(
  config: GlobalConfig,
  usedConfigKeys: string[],
  command: string,
): ConfigSnapshot {
  const snapshot: ConfigSnapshot = {};

  for (const key of usedConfigKeys) {
    if (key === "hostname") {
      snapshot.hostname = config.hostname;
    } else if (key === "httpsCert") {
      snapshot.httpsCert = config.httpsCert;
    } else if (key === "httpsKey") {
      snapshot.httpsKey = config.httpsKey;
    } else if (key === "protocol") {
      snapshot.protocol = config.protocol;
    } else if (key === "portRange") {
      snapshot.portRangeMin = config.portRange.min;
      snapshot.portRangeMax = config.portRange.max;
    }
  }

  // Capture custom variables used in command
  const usedCustomVars = extractUsedCustomVariables(command, config);
  if (usedCustomVars.length > 0) {
    snapshot.customVariables = {};
    for (const varName of usedCustomVars) {
      snapshot.customVariables[varName] = config.variables?.[varName] ?? "";
    }
  }

  return snapshot;
}

/**
 * Detect config drift for a server
 * @param server - Server entry from registry
 * @param currentConfig - Current global config
 * @returns Drift detection result
 */
export function detectDrift(
  server: ServerEntry,
  currentConfig: GlobalConfig,
): DriftResult {
  const driftedValues: DriftedValue[] = [];
  let portOutOfRange = false;
  let protocolChanged = false;

  // If no snapshot exists, we can't detect drift
  if (!server.configSnapshot || !server.usedConfigKeys) {
    return { hasDrift: false, driftedValues: [] };
  }

  for (const configKey of server.usedConfigKeys) {
    let startedWith: string | undefined;
    let currentValue: string | undefined;
    let templateVar: string | undefined;

    if (configKey === "hostname") {
      startedWith = server.configSnapshot.hostname;
      currentValue = currentConfig.hostname;
      templateVar = "hostname";
    } else if (configKey === "httpsCert") {
      startedWith = server.configSnapshot.httpsCert;
      currentValue = currentConfig.httpsCert;
      templateVar = "https-cert";
    } else if (configKey === "httpsKey") {
      startedWith = server.configSnapshot.httpsKey;
      currentValue = currentConfig.httpsKey;
      templateVar = "https-key";
    } else if (configKey === "protocol") {
      startedWith = server.configSnapshot.protocol;
      currentValue = currentConfig.protocol;
      templateVar = "protocol (via url)";
      if (startedWith !== undefined && startedWith !== currentValue) {
        protocolChanged = true;
      }
    } else if (configKey === "portRange") {
      // Special handling: check if current port is still in range
      const min = currentConfig.portRange.min;
      const max = currentConfig.portRange.max;
      // Only check if we have snapshot values (backward compatibility)
      if (server.configSnapshot.portRangeMin !== undefined) {
        if (server.port < min || server.port > max) {
          portOutOfRange = true;
          driftedValues.push({
            configKey: "portRange",
            templateVar: "port",
            startedWith: `${server.configSnapshot.portRangeMin}-${server.configSnapshot.portRangeMax}`,
            currentValue: `${min}-${max} (port ${server.port} out of range)`,
          });
        }
      }
      continue; // Skip the standard comparison below
    }

    if (templateVar && startedWith !== currentValue) {
      driftedValues.push({
        configKey,
        templateVar,
        startedWith,
        currentValue,
      });
    }
  }

  // Check custom variables drift
  if (server.configSnapshot.customVariables) {
    for (const [varName, startedWith] of Object.entries(server.configSnapshot.customVariables)) {
      const currentValue = currentConfig.variables?.[varName];
      if (startedWith !== currentValue) {
        driftedValues.push({
          configKey: `variables.${varName}`,
          templateVar: varName,
          startedWith,
          currentValue,
        });
      }
    }
  }

  return {
    hasDrift: driftedValues.length > 0,
    driftedValues,
    portOutOfRange,
    protocolChanged,
  };
}

/**
 * Find all servers that use a specific config key
 * @param servers - Array of server entries
 * @param configKey - The config key to search for
 * @returns Array of servers using that config key
 */
export function findServersUsingConfigKey(
  servers: ServerEntry[],
  configKey: string,
): ServerEntry[] {
  return servers.filter(server =>
    server.usedConfigKeys?.includes(configKey),
  );
}

/**
 * Find all servers with config drift
 * @param servers - Array of server entries
 * @param currentConfig - Current global config
 * @returns Array of servers with drift and their drift details
 */
export function findServersWithDrift(
  servers: ServerEntry[],
  currentConfig: GlobalConfig,
): Array<{ server: ServerEntry; drift: DriftResult }> {
  const results: Array<{ server: ServerEntry; drift: DriftResult }> = [];

  for (const server of servers) {
    const drift = detectDrift(server, currentConfig);
    if (drift.hasDrift) {
      results.push({ server, drift });
    }
  }

  return results;
}

/**
 * Format drift information for display
 * @param drift - Drift result to format
 * @returns Formatted string describing the drift
 */
export function formatDrift(drift: DriftResult): string {
  if (!drift.hasDrift) {
    return "No config drift";
  }

  const lines = drift.driftedValues.map(d => {
    const started = d.startedWith ?? "(not set)";
    const current = d.currentValue ?? "(not set)";
    return `  ${d.configKey}: "${started}" → "${current}"`;
  });

  return `Config drift detected:\n${lines.join("\n")}`;
}
